"""Unit tests for the Aether Python SDK.

No network: every call is served by an httpx MockTransport from a fixture in
``clients/fixtures``, captured live on 2026-09-11. Run with

    python3 -m unittest discover -s clients/python/tests
"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
FIXTURES = ROOT.parent / "fixtures"

from aether import AetherClient, AetherError, Chunk, _parse_output  # noqa: E402


def load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.json").read_text())


class Recorder:
    """Captures the request body so we can assert on what the SDK sent."""

    def __init__(self, body: dict[str, Any], status: int = 200) -> None:
        self.body = body
        self.status = status
        self.path: str | None = None
        self.sent: dict[str, Any] = {}

    def transport(self) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            self.path = request.url.path
            self.sent = json.loads(request.content or b"{}")
            return httpx.Response(self.status, json=self.body)

        return httpx.MockTransport(handler)

    def client(self) -> AetherClient:
        return AetherClient(transport=self.transport())


class TestScopedSearch(unittest.TestCase):
    """A scoped search: scope=issuer and NO caveat is the only guarantee."""

    def setUp(self) -> None:
        self.rec = Recorder(load("financial_search_scoped"))

    def test_envelope_preserves_scope_mode_total(self) -> None:
        with self.rec.client() as aether:
            out = aether.financial_search(
                query="data center revenue growth drivers",
                issuer={"ticker": "NVDA"},
                fiscal_year=2027,
                limit=2,
            )
        self.assertEqual(out.scope, "issuer")
        self.assertIsNone(out.quality_caveat)
        self.assertEqual(out.mode, "search")
        self.assertEqual(out.total, 415)
        self.assertEqual(out.source, "aether-pg-hybrid")

    def test_issuer_and_fiscal_year_reach_the_wire(self) -> None:
        with self.rec.client() as aether:
            aether.financial_search(
                query="data center revenue growth drivers",
                issuer={"ticker": "NVDA"},
                fiscal_year=2027,
                limit=2,
            )
        self.assertEqual(self.rec.path, "/v1/tools/financial_search")
        self.assertEqual(self.rec.sent["issuer"], {"ticker": "NVDA"})
        self.assertEqual(self.rec.sent["fiscal_year"], 2027)
        # Unset optionals are omitted, not sent as null.
        self.assertNotIn("profile", self.rec.sent)
        self.assertNotIn("scope", self.rec.sent)

    def test_per_hit_diagnostics_survive_parsing(self) -> None:
        with self.rec.client() as aether:
            out = aether.financial_search(query="x", issuer={"ticker": "NVDA"})
        hit = out.results[0]
        self.assertIsNotNone(hit.diagnostics)
        assert hit.diagnostics is not None
        self.assertEqual(hit.diagnostics["fiscal_year_semantics"], "dei_fiscal_year_focus")
        self.assertEqual(hit.diagnostics["candidate_pool"], 150)
        self.assertEqual(hit.diagnostics["dedupe_dropped"], 131)
        self.assertEqual(hit.diagnostics["issuer_how"], "explicit_ticker")
        self.assertIsInstance(hit.confidence, float)
        self.assertEqual(hit.metadata["accession_number"], "0001045810-26-000075")

    def test_fiscal_year_accepts_a_list(self) -> None:
        with self.rec.client() as aether:
            aether.financial_search(query="x", issuer={"cik": "1045810"}, fiscal_year=[2026, 2027])
        self.assertEqual(self.rec.sent["fiscal_year"], [2026, 2027])


class TestCrossCompanySearch(unittest.TestCase):
    """The caveated shape. A caveat must never be silently dropped."""

    def setUp(self) -> None:
        self.rec = Recorder(load("financial_search_cross_company"))

    def test_caveat_is_preserved(self) -> None:
        with self.rec.client() as aether:
            out = aether.financial_search(
                query="HBM high bandwidth memory supply agreement",
                scope="cross_company",
                limit=2,
            )
        self.assertEqual(out.scope, "cross_company")
        self.assertIsNotNone(out.quality_caveat)
        assert out.quality_caveat is not None
        self.assertIn("scope=cross_company", out.quality_caveat)
        # total is the candidate cap on this path, not a corpus count.
        self.assertEqual(out.total, 2000)
        self.assertEqual(self.rec.sent["scope"], "cross_company")

    def test_hits_can_come_from_any_issuer(self) -> None:
        with self.rec.client() as aether:
            out = aether.financial_search(query="HBM", scope="cross_company")
        self.assertNotEqual(out.results[0].metadata.get("ticker"), "NVDA")


class TestFetchMode(unittest.TestCase):
    """Omit `query` and nothing is ranked — so nothing reports a confidence."""

    def setUp(self) -> None:
        self.rec = Recorder(load("financial_search_fetch"))

    def test_mode_is_fetch_and_confidence_is_absent(self) -> None:
        with self.rec.client() as aether:
            out = aether.financial_search(
                issuer={"ticker": "NVDA"}, form_type=["10-Q"], fiscal_year=2027, limit=8
            )
        self.assertEqual(out.mode, "fetch")
        self.assertEqual(out.scope, "issuer")
        self.assertEqual(out.source, "aether-pg-fetch")
        self.assertEqual(out.total, 128)  # matching CHUNKS, not returned rows
        self.assertGreater(out.total, len(out.results))
        for hit in out.results:
            self.assertIsNone(hit.confidence)

    def test_omitting_query_omits_the_field(self) -> None:
        with self.rec.client() as aether:
            aether.financial_search(issuer={"ticker": "NVDA"}, form_type=["10-Q"])
        self.assertNotIn("query", self.rec.sent)
        self.assertEqual(self.rec.sent["form_type"], ["10-Q"])

    def test_filing_order_not_relevance_order(self) -> None:
        with self.rec.client() as aether:
            out = aether.financial_search(issuer={"ticker": "NVDA"}, form_type=["10-Q"])
        self.assertEqual(out.results[0].metadata["section"], "Item 1")


class TestBodyOffset(unittest.TestCase):
    """Crop from body_offset, not from character 0."""

    def test_body_offset_is_lifted_out_of_metadata_retrieval(self) -> None:
        rec = Recorder(load("financial_search_body_offset"))
        with rec.client() as aether:
            out = aether.financial_search(query="TSMC monthly net revenue", issuer={"ticker": "TSM"})
        hit = out.results[0]
        self.assertEqual(hit.body_offset, 1462)
        # Character 0 is the EDGAR cover, which is exactly the bug.
        self.assertTrue(hit.text.startswith("6-K"))

    def test_absent_body_offset_is_none(self) -> None:
        rec = Recorder(load("financial_search_scoped"))
        with rec.client() as aether:
            out = aether.financial_search(query="x", issuer={"ticker": "NVDA"})
        self.assertIsNone(out.results[0].body_offset)


class TestUnifiedSearch(unittest.TestCase):
    """`search` is the unified tool, not an alias of financial_search."""

    def setUp(self) -> None:
        self.rec = Recorder(load("search_unified"))

    def test_hits_the_unified_endpoint(self) -> None:
        with self.rec.client() as aether:
            aether.search(query="data center revenue", issuer={"ticker": "NVDA"}, corpora=["sec"])
        self.assertEqual(self.rec.path, "/v1/tools/search")
        self.assertEqual(self.rec.sent["corpora"], ["sec"])

    def test_corpus_tag_and_top_level_diagnostics(self) -> None:
        with self.rec.client() as aether:
            out = aether.search(query="data center revenue", issuer={"ticker": "NVDA"})
        self.assertEqual(out.scope, "issuer")
        self.assertIsNone(out.quality_caveat)
        hit = out.results[0]
        self.assertEqual(hit.corpus, "sec")
        self.assertTrue(hit.anchor_id)
        assert hit.diagnostics is not None
        self.assertEqual(hit.diagnostics["mode"], "search")
        self.assertEqual(hit.diagnostics["issuer_how"], "explicit_ticker")

    def test_filing_filters_are_forwarded_not_dropped(self) -> None:
        with self.rec.client() as aether:
            aether.search(issuer={"ticker": "NVDA"}, form_type=["10-Q"], section="Item 1A", limit=2)
        self.assertEqual(self.rec.sent["form_type"], ["10-Q"])
        self.assertEqual(self.rec.sent["section"], "Item 1A")
        self.assertNotIn("query", self.rec.sent)

    def test_legacy_alias_still_points_at_financial_search(self) -> None:
        rec = Recorder(load("financial_search_scoped"))
        with rec.client() as aether:
            aether.financial_search_legacy(query="x", tickers=["NVDA"], schemas=["a"])
        self.assertEqual(rec.path, "/v1/tools/financial_search")
        self.assertNotIn("tickers", rec.sent)


class TestTranscriptSearch(unittest.TestCase):
    def test_issuer_fiscal_year_and_quarter_reach_the_wire(self) -> None:
        rec = Recorder(
            {
                "query": "",
                "mode": "fetch",
                "ticker_filter": "NVDA",
                "results": [
                    {
                        "segment_id": "seg-1",
                        "ticker": "NVDA",
                        "fiscal_year": 2027,
                        "quarter": "Q2",
                        "call_date": "2026-08-26",
                        "speaker_name": "Colette Kress",
                        "speaker_role": "CFO",
                        "text": "Data center revenue was …",
                        "source_url": "https://www.sec.gov/…",
                        "citation": "NVDA Q2 FY2027 earnings call (2026-08-26)",
                        "confidence": 0,
                    }
                ],
                "total": 1,
                "source": "aether-pg-transcripts-fetch",
                "scope": "issuer",
                "latency_ms": 5,
            }
        )
        with rec.client() as aether:
            out = aether.transcript_search(
                issuer={"ticker": "NVDA"}, fiscal_year=2027, quarter="Q2", limit=5
            )
        self.assertEqual(rec.path, "/v1/tools/transcript_search")
        self.assertEqual(rec.sent["issuer"], {"ticker": "NVDA"})
        self.assertEqual(rec.sent["quarter"], "Q2")
        self.assertEqual(out.mode, "fetch")
        self.assertEqual(out.ticker_filter, "NVDA")
        # Segments are keyed `segment_id`; the parse must not lose them.
        self.assertEqual(out.results[0].id, "seg-1")
        self.assertEqual(out.results[0].raw["quarter"], "Q2")


class TestParseOutput(unittest.TestCase):
    def test_unknown_fields_survive_in_raw(self) -> None:
        out = _parse_output(
            {
                "query": "q",
                "results": [{"id": "a", "text": "t", "source": "s", "future_field": 1}],
                "total": 1,
                "source": "aether-pg-hybrid",
                "latency_ms": 4,
                "scope": "issuer",
                "future_envelope_field": True,
            }
        )
        self.assertEqual(out.raw["future_envelope_field"], True)
        self.assertEqual(out.results[0].raw["future_field"], 1)

    def test_empty_envelope_does_not_explode(self) -> None:
        out = _parse_output({})
        self.assertEqual(out.results, [])
        self.assertEqual(out.total, 0)
        self.assertIsNone(out.scope)
        self.assertEqual(out.partial_errors, [])

    def test_chunk_is_still_constructible_positionally(self) -> None:
        c = Chunk("id", "text", "sec/10-K/x")
        self.assertEqual(c.source, "sec/10-K/x")
        self.assertIsNone(c.body_offset)


class TestErrors(unittest.TestCase):
    def test_400_raises_with_the_server_message(self) -> None:
        rec = Recorder({"error": "invalid_input", "details": "unsupported field: bogus"}, status=400)
        with rec.client() as aether:
            with self.assertRaises(AetherError) as ctx:
                aether.search(query="x", issuer={"ticker": "NVDA"})
        self.assertEqual(ctx.exception.status, 400)
        self.assertIn("unsupported field", ctx.exception.body)


if __name__ == "__main__":
    unittest.main()
