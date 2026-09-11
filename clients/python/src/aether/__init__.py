"""aether — Python client for the Aether REST API.

Tiny typed wrapper over the ``/v1/tools/*`` endpoints (the same tools the
Aether MCP server exposes). Mirrors the TypeScript SDK at
``clients/typescript`` so users picking a language find the same shape.

Endpoints
---------
- ``POST /v1/tools/search``            — unified: filings + JP/KR + regulation + earnings calls
- ``POST /v1/tools/financial_search``  — SEC filings (10-K/10-Q/8-K, S-1…) + non-US registries
- ``POST /v1/tools/transcript_search`` — earnings-call transcripts + press exhibits
- ``POST /v1/tools/regulation_search`` — EU financial regulation (MiFID II, MiCA, DORA, AML)

The contract in one line
------------------------
**Name the company on every call, then narrow.** Pass
``issuer={"ticker": "NVDA"}`` (or ``cik``, or ``company_name`` for non-US
filers) and the call is scoped, fast and precise. Omit it and the call runs
``scope="cross_company"``: slower, ranked by relevance only, and the answer
carries a ``quality_caveat``. ``scope == "issuer"`` **with no caveat** is the
only guarantee you got a filtered answer — read both fields.

Two modes
---------
``query`` is optional. Pass it to **search** (hits ranked by relevance,
``mode == "search"``). Omit it to **fetch**: pass an identifier
(``issuer.ticker`` / ``issuer.cik`` / ``issuer.company_name`` / ``cik`` /
``accession_number``) plus any of ``form_type`` / ``fiscal_year`` /
``section`` and get that filing's sections back in filing order with no
ranking at all — ``mode == "fetch"``, and ``confidence`` is absent on every
hit because there is no relevance signal.

Auth is a bearer token — an API key from
https://aether.evidinvest.com/developer/keys, or an OAuth access token.
The SDK doesn't manage token lifecycle; pass a fresh one in. Anonymous
calls work but hit a low rate limit.

Example
-------
>>> from aether import AetherClient
>>> with AetherClient(api_key="ak_...") as aether:
...     out = aether.financial_search(
...         query="data center revenue growth drivers",
...         issuer={"ticker": "NVDA"},
...         fiscal_year=2027,
...         limit=5,
...     )
...     if out.quality_caveat:
...         print("caveat:", out.quality_caveat)
...     for chunk in out.results:
...         print(chunk.citation, chunk.text[chunk.body_offset or 0 :][:200])
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Union

import httpx

DEFAULT_BASE_URL = "https://api.aether.evidinvest.com"

#: ``{"ticker": …}`` / ``{"cik": …}`` / ``{"company_name": …}`` — at least one.
Issuer = dict[str, str]

#: A single fiscal year, or up to ten of them.
FiscalYear = Union[int, list[int]]


@dataclass
class Chunk:
    """One ready-to-cite evidence payload.

    ``metadata`` carries cik, ticker, company_name, form_type, section,
    accession_number, source_url (sec.gov link), period_of_report and a
    ``retrieval`` sub-object of engine diagnostics (varies by tool).

    ``raw`` is the untouched hit as the API returned it — nothing this
    dataclass does not name is lost.
    """

    id: str
    text: str
    source: str
    citation: Optional[str] = None
    as_of_date: Optional[str] = None
    #: 0–1 relevance. **Absent in fetch mode** (no ranking ran), and it is a
    #: relative score, not a threshold — do not gate rendering on it.
    confidence: Optional[float] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    # --- unified `search` hits carry these at the top level ------------------
    corpus: Optional[str] = None
    corpus_label: Optional[str] = None
    source_url: Optional[str] = None
    anchor_id: Optional[str] = None
    context_token: Optional[str] = None
    #: Character offset in ``text`` where the EDGAR cover page ends and the
    #: body begins. Crop from here, not from 0, or a rendered excerpt reads
    #: "UNITED STATES SECURITIES AND EXCHANGE COMMISSION". ``None`` means the
    #: text opens with its own body.
    body_offset: Optional[int] = None
    #: candidate_pool / dedupe_dropped / junk_dropped / mode /
    #: fiscal_year_semantics / issuer_how — diagnostics, never branch logic.
    diagnostics: Optional[dict[str, Any]] = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchOutput:
    query: str
    results: list[Chunk]
    total: int
    source: str
    latency_ms: int
    domain: Optional[str] = None  # financial_search only
    #: ``"search"`` (ranked) or ``"fetch"`` (filters only, filing order).
    mode: Optional[str] = None
    #: ``"issuer"`` or ``"cross_company"``. On the unified tool this is the
    #: worst case across the corpora that answered.
    scope: Optional[str] = None
    #: Present when the answer is not issuer-precise. Read it before trusting
    #: the result — ``scope == "issuer"`` with no caveat is the only guarantee.
    quality_caveat: Optional[str] = None
    ticker_filter: Optional[str] = None  # transcript_search only
    partial_errors: list[Any] = field(default_factory=list)  # unified search
    raw: dict[str, Any] = field(default_factory=dict)


class AetherError(Exception):
    """Non-2xx response from the Aether API."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"Aether API error {status}: {body[:200]}")
        self.status = status
        self.body = body


def _retrieval(hit: dict[str, Any]) -> dict[str, Any]:
    meta = hit.get("metadata") or hit.get("meta") or {}
    retrieval = meta.get("retrieval") if isinstance(meta, dict) else None
    return retrieval if isinstance(retrieval, dict) else {}


def _parse_chunk(hit: dict[str, Any]) -> Chunk:
    retrieval = _retrieval(hit)
    body_offset = hit.get("body_offset")
    if body_offset is None:
        body_offset = retrieval.get("body_offset")
    diagnostics = hit.get("diagnostics")
    if diagnostics is None and retrieval:
        diagnostics = retrieval
    return Chunk(
        # transcript segments are keyed `segment_id`, filing chunks `id`.
        id=hit.get("id") or hit.get("segment_id") or "",
        text=hit.get("text", ""),
        source=hit.get("source") or hit.get("source_type") or "",
        citation=hit.get("citation"),
        as_of_date=hit.get("as_of_date") or hit.get("call_date"),
        confidence=hit.get("confidence"),
        metadata=hit.get("metadata") or hit.get("meta") or {},
        corpus=hit.get("corpus"),
        corpus_label=hit.get("corpus_label"),
        source_url=hit.get("source_url") or (hit.get("metadata") or {}).get("source_url"),
        anchor_id=hit.get("anchor_id"),
        context_token=hit.get("context_token"),
        body_offset=body_offset,
        diagnostics=diagnostics or None,
        raw=hit,
    )


def _parse_output(body: dict[str, Any]) -> SearchOutput:
    return SearchOutput(
        query=body.get("query", ""),
        results=[_parse_chunk(c) for c in body.get("results", [])],
        total=body.get("total", 0),
        source=body.get("source", ""),
        latency_ms=body.get("latency_ms", 0),
        domain=body.get("domain"),
        mode=body.get("mode"),
        scope=body.get("scope"),
        quality_caveat=body.get("quality_caveat"),
        ticker_filter=body.get("ticker_filter"),
        partial_errors=body.get("partial_errors") or [],
        raw=body,
    )


def _drop_none(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in payload.items() if v is not None}


class AetherClient:
    """Synchronous HTTP client."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 60.0,
        transport: Optional[httpx.BaseTransport] = None,
    ) -> None:
        # Do not drop this below ~20 s on any path that can go cross-company:
        # the engine's own cross-company floor is 15 s.
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            headers={"authorization": f"Bearer {api_key}"} if api_key else {},
            transport=transport,
        )

    def __enter__(self) -> "AetherClient":
        return self

    def __exit__(self, *exc_info: Any) -> None:
        self._client.close()

    def close(self) -> None:
        self._client.close()

    def _post(self, path: str, payload: dict[str, Any]) -> SearchOutput:
        resp = self._client.post(path, json=_drop_none(payload))
        if resp.status_code >= 400:
            raise AetherError(resp.status_code, resp.text)
        return _parse_output(resp.json())

    def search(
        self,
        *,
        query: Optional[str] = None,  # omit → fetch mode (an identifier is then required)
        issuer: Optional[Issuer] = None,
        fiscal_year: Optional[FiscalYear] = None,
        scope: Optional[str] = None,  # "issuer" (default) | "cross_company"
        tickers: Optional[list[str]] = None,  # legacy alias of issuer
        limit: Optional[int] = None,  # server caps at 50, default 10
        corpora: Optional[list[str]] = None,  # sec | jp | kr | regulation | transcripts
        form_type: Optional[list[str]] = None,
        accession_number: Optional[str] = None,
        section: Optional[Union[str, list[str]]] = None,
        quarter: Optional[Union[str, list[str]]] = None,
        return_format: Optional[str] = None,  # "chunk" (unified default) | "section" | "both"
    ) -> SearchOutput:
        """Unified search across every corpus at once — use this for most questions.

        Auto-routes and merges SEC filings, Japan/EDINET and Korea/DART annual
        reports, EU regulation and earnings calls into one corpus-tagged result
        set; each hit carries a ``corpus`` tag. Pass ``issuer`` — it is
        forwarded to every corpus, so one named subject scopes filings and
        earnings calls together. Ownership questions do not go through search.

        Unsupported fields are rejected with a 400 naming them, not dropped.
        """
        return self._post(
            "/v1/tools/search",
            {
                "query": query,
                "issuer": issuer,
                "fiscal_year": fiscal_year,
                "scope": scope,
                "tickers": tickers,
                "limit": limit,
                "corpora": corpora,
                "form_type": form_type,
                "accession_number": accession_number,
                "section": section,
                "quarter": quarter,
                "return_format": return_format,
            },
        )

    def financial_search(
        self,
        *,
        query: Optional[str] = None,  # omit → fetch mode (an identifier is then required)
        issuer: Optional[Issuer] = None,
        fiscal_year: Optional[FiscalYear] = None,  # the ISSUER's fiscal year, not a calendar one
        scope: Optional[str] = None,  # "issuer" (default) | "cross_company"
        domain: Optional[str] = None,  # deprecated passthrough; retrieval never reads it
        limit: Optional[int] = None,  # server caps at 50, default 10
        fields: Optional[list[str]] = None,
        profile: Optional[str] = None,  # "hybrid" (default) | "bm25"
        return_format: Optional[str] = None,  # "section" (default) | "chunk" | "both"
        accession_number: Optional[str] = None,  # "0001045810-26-000075"
        cik: Optional[list[str]] = None,
        form_type: Optional[list[str]] = None,  # ["10-Q"]
        section: Optional[Union[str, list[str]]] = None,  # substring of the stored label
        exclude_form_type: Optional[list[str]] = None,
        prefer_recent: Optional[bool] = None,
        jurisdiction: Optional[list[str]] = None,  # e.g. ["SE"], ["JP"], ["KR"]
    ) -> SearchOutput:
        """Search (or fetch) SEC filings + Sweden/Japan/Korea registries.

        ``fiscal_year`` is the issuer's own fiscal year as the company labels
        it — NVIDIA FY2027 is the year ending Jan 2027, filed during calendar
        2026. A year that matches nothing widens ±1 once and says so in
        ``quality_caveat``.
        """
        return self._post(
            "/v1/tools/financial_search",
            {
                "query": query,
                "issuer": issuer,
                "fiscal_year": fiscal_year,
                "scope": scope,
                "domain": domain,
                "limit": limit,
                "fields": fields,
                "profile": profile,
                "return_format": return_format,
                "accession_number": accession_number,
                "cik": cik,
                "form_type": form_type,
                "section": section,
                "exclude_form_type": exclude_form_type,
                "prefer_recent": prefer_recent,
                "jurisdiction": jurisdiction,
            },
        )

    def transcript_search(
        self,
        *,
        query: Optional[str] = None,  # omit → fetch mode (issuer.ticker is then required)
        issuer: Optional[Issuer] = None,  # this corpus scopes on ticker
        fiscal_year: Optional[FiscalYear] = None,  # the segment's own labelled fiscal year
        scope: Optional[str] = None,  # "issuer" (default) | "cross_company"
        ticker: Optional[str] = None,  # legacy alias of issuer["ticker"]
        lookback_quarters: Optional[int] = None,
        speaker_role: Optional[str] = None,  # "CEO" | "CFO" | "Analyst" | …
        quarter: Optional[Union[str, list[str]]] = None,  # "Q2" or ["Q1","Q2"]
        limit: Optional[int] = None,
        profile: Optional[str] = None,  # "hybrid" (default) | "bm25"
        date_from: Optional[str] = None,  # inclusive ISO date on call date
        date_to: Optional[str] = None,
        order: Optional[str] = None,  # "relevance" | "earliest" | "latest"
        source_type: Optional[str] = None,  # "press_release" | "furnished_transcript" | "asr_call"
    ) -> SearchOutput:
        """Search (or fetch) earnings-call transcripts and press exhibits.

        ``issuer.ticker`` + ``fiscal_year`` + ``quarter`` with no ``query``
        names exactly one call and returns it in spoken order.
        ``scope="cross_company"`` drops the ticker filter, so a caveated answer
        is never secretly a scoped one.
        """
        return self._post(
            "/v1/tools/transcript_search",
            {
                "query": query,
                "issuer": issuer,
                "fiscal_year": fiscal_year,
                "scope": scope,
                "ticker": ticker,
                "lookback_quarters": lookback_quarters,
                "speaker_role": speaker_role,
                "quarter": quarter,
                "limit": limit,
                "profile": profile,
                "date_from": date_from,
                "date_to": date_to,
                "order": order,
                "source_type": source_type,
            },
        )

    def regulation_search(
        self,
        *,
        query: str,
        celex: Optional[Union[str, list[str]]] = None,  # this corpus's anchor, e.g. "32024R1624"
        doc_type: Optional[str] = None,  # "regulation" | "directive" | "rts" | "its" | "decision"
        article: Optional[str] = None,
        chunk_type: Optional[str] = None,  # "paragraph" | "article_intro" | "recital" | "table" | "annex"
        aml_topics: Optional[Union[str, list[str]]] = None,
        prefer_consolidated: Optional[bool] = None,
        limit: Optional[int] = None,
        profile: Optional[str] = None,  # "bm25" | "hybrid"
    ) -> SearchOutput:
        """Search EU financial regulation (MiFID II, MiCA, DORA, AML package).

        ``celex`` is this corpus's anchor — the equivalent of naming the issuer
        on a filing search. With no ``celex`` the call runs across all 29 acts
        as ``scope="cross_company"`` and carries a caveat.
        """
        return self._post(
            "/v1/tools/regulation_search",
            {
                "query": query,
                "celex": celex,
                "doc_type": doc_type,
                "article": article,
                "chunk_type": chunk_type,
                "aml_topics": aml_topics,
                "prefer_consolidated": prefer_consolidated,
                "limit": limit,
                "profile": profile,
            },
        )

    def financial_search_legacy(self, **kwargs: Any) -> SearchOutput:
        """Deprecated pre-0.3 alias of :meth:`financial_search`.

        Until 0.3.0 ``search()`` was an alias of ``financial_search``. It is
        now the unified ``/v1/tools/search`` tool; this method is the old
        behaviour, kept for one release.
        """
        kwargs.pop("schemas", None)  # 0.1.x param with no server-side equivalent
        kwargs.pop("tickers", None)
        return self.financial_search(**kwargs)


__all__ = [
    "AetherClient",
    "AetherError",
    "Chunk",
    "FiscalYear",
    "Issuer",
    "SearchOutput",
]
__version__ = "0.3.0"
