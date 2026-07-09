"""aether — Python client for the Aether REST API.

Tiny typed wrapper over the ``/v1/tools/*`` endpoints (the same tools the
Aether MCP server exposes). Mirrors the TypeScript SDK at
``clients/typescript`` so users picking a language find the same shape.

Endpoints
---------
- ``POST /v1/tools/financial_search``  — SEC filings (10-K/10-Q/8-K, S-1…) + non-US registries
- ``POST /v1/tools/transcript_search`` — earnings-call transcripts + press exhibits
- ``POST /v1/tools/regulation_search`` — EU financial regulation (MiFID II, MiCA, DORA, AML)

Auth is a bearer token — an API key from
https://aether.evidinvest.com/developer/keys, or an OAuth access token.
The SDK doesn't manage token lifecycle; pass a fresh one in. Anonymous
calls work but hit a low rate limit.

Example
-------
>>> from aether import AetherClient
>>> with AetherClient(api_key="ak_...") as aether:
...     out = aether.financial_search(query="Apple revenue concentration risk", limit=5)
...     for chunk in out.results:
...         print(chunk.citation, chunk.metadata.get("source_url"))
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional, Union

import httpx

DEFAULT_BASE_URL = "https://api.aether.evidinvest.com"


@dataclass
class Chunk:
    """One ready-to-cite evidence payload.

    ``metadata`` carries cik, ticker, company_name, form_type, section,
    accession_number, source_url (sec.gov link), period_of_report, …
    (varies by tool).
    """

    id: str
    text: str
    source: str
    citation: Optional[str] = None
    as_of_date: Optional[str] = None
    confidence: Optional[float] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchOutput:
    query: str
    results: list[Chunk]
    total: int
    source: str
    latency_ms: int
    domain: Optional[str] = None  # financial_search only


class AetherError(Exception):
    """Non-2xx response from the Aether API."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"Aether API error {status}: {body[:200]}")
        self.status = status
        self.body = body


def _parse_output(body: dict[str, Any]) -> SearchOutput:
    return SearchOutput(
        query=body.get("query", ""),
        results=[
            Chunk(
                id=c.get("id", ""),
                text=c.get("text", ""),
                source=c.get("source", ""),
                citation=c.get("citation"),
                as_of_date=c.get("as_of_date"),
                confidence=c.get("confidence"),
                metadata=c.get("metadata") or {},
            )
            for c in body.get("results", [])
        ],
        total=body.get("total", 0),
        source=body.get("source", ""),
        latency_ms=body.get("latency_ms", 0),
        domain=body.get("domain"),
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
    ) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            timeout=timeout,
            headers={"authorization": f"Bearer {api_key}"} if api_key else {},
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

    def financial_search(
        self,
        *,
        query: str,
        domain: Optional[str] = None,  # "public_equity" | "supply_chain" | "auto"
        limit: Optional[int] = None,  # server caps at 50, default 10
        fields: Optional[list[str]] = None,
        profile: Optional[str] = None,  # "bm25" | "hybrid" | "hybrid_rerank" | "hybrid_rerank_tickerprior"
        return_format: Optional[str] = None,  # "section" (default) | "chunk" | "both"
        jurisdiction: Optional[list[str]] = None,  # e.g. ["SE"], ["JP"], ["KR"]
    ) -> SearchOutput:
        """Search SEC filings (+ Sweden/Japan/Korea registries)."""
        return self._post(
            "/v1/tools/financial_search",
            {
                "query": query,
                "domain": domain,
                "limit": limit,
                "fields": fields,
                "profile": profile,
                "return_format": return_format,
                "jurisdiction": jurisdiction,
            },
        )

    def transcript_search(
        self,
        *,
        query: str,
        ticker: Optional[str] = None,
        lookback_quarters: Optional[int] = None,
        speaker_role: Optional[str] = None,  # "CEO" | "CFO" | "Analyst" | …
        limit: Optional[int] = None,
        profile: Optional[str] = None,  # "bm25" | "hybrid"
        date_from: Optional[str] = None,  # inclusive ISO date on call date
        date_to: Optional[str] = None,
        order: Optional[str] = None,  # "relevance" | "earliest" | "latest"
        source_type: Optional[str] = None,  # "press_release" | "furnished_transcript" | "asr_call"
    ) -> SearchOutput:
        """Search earnings-call transcripts and press exhibits."""
        return self._post(
            "/v1/tools/transcript_search",
            {
                "query": query,
                "ticker": ticker,
                "lookback_quarters": lookback_quarters,
                "speaker_role": speaker_role,
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
        celex: Optional[Union[str, list[str]]] = None,  # e.g. "32024R1624"
        doc_type: Optional[str] = None,  # "regulation" | "directive" | "rts" | "its" | "decision"
        article: Optional[str] = None,
        chunk_type: Optional[str] = None,  # "paragraph" | "article_intro" | "recital" | "table" | "annex"
        aml_topics: Optional[Union[str, list[str]]] = None,
        prefer_consolidated: Optional[bool] = None,
        limit: Optional[int] = None,
        profile: Optional[str] = None,  # "bm25" | "hybrid"
    ) -> SearchOutput:
        """Search EU financial regulation (MiFID II, MiCA, DORA, AML package)."""
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

    def search(self, **kwargs: Any) -> SearchOutput:
        """Deprecated alias of :meth:`financial_search` (kept for 0.1.x callers)."""
        kwargs.pop("schemas", None)  # 0.1.x param with no server-side equivalent
        kwargs.pop("tickers", None)
        return self.financial_search(**kwargs)


__all__ = [
    "AetherClient",
    "AetherError",
    "Chunk",
    "SearchOutput",
]
__version__ = "0.2.0"
