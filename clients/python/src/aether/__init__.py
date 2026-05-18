"""aether — Python client for the Aether REST API.

Tiny typed wrapper over ``/v1/search``. Mirrors the TypeScript SDK at
``clients/typescript`` so users picking a language find the same shape.

Auth is a bearer token — an API key from
https://aether.evidinvest.com/developer/keys, or an OAuth access token.
The SDK doesn't manage token lifecycle; pass a fresh one in.

Example
-------
>>> from aether import AetherClient
>>> aether = AetherClient(api_key="ak_...")
>>> result = aether.search(query="Apple revenue concentration", tickers=["AAPL"], limit=5)
>>> for hit in result.hits:
...     print(hit.score, hit.section_title)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

DEFAULT_BASE_URL = "https://api.aether.evidinvest.com"


@dataclass
class SearchHit:
    id: str
    schema: str
    score: float
    title: Optional[str] = None
    snippet: Optional[str] = None
    source_url: Optional[str] = None
    cik: Optional[str] = None
    ticker: Optional[str] = None
    section_title: Optional[str] = None
    filed_at: Optional[str] = None
    fields: dict[str, Any] = field(default_factory=dict)


@dataclass
class SearchResponse:
    query: str
    hits: list[SearchHit]
    total_hits: int
    latency_ms: int


class AetherError(Exception):
    """Non-2xx response from the Aether API."""

    def __init__(self, status: int, body: str) -> None:
        super().__init__(f"Aether API error {status}: {body[:200]}")
        self.status = status
        self.body = body


class AetherClient:
    """Synchronous HTTP client. Use ``AsyncAetherClient`` for asyncio."""

    def __init__(
        self,
        *,
        api_key: Optional[str] = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: float = 30.0,
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

    def search(
        self,
        *,
        query: str,
        limit: Optional[int] = None,
        schemas: Optional[list[str]] = None,
        tickers: Optional[list[str]] = None,
    ) -> SearchResponse:
        payload: dict[str, Any] = {"query": query}
        if limit is not None:
            payload["limit"] = limit
        if schemas:
            payload["schemas"] = schemas
        if tickers:
            payload["tickers"] = tickers

        resp = self._client.post("/v1/search", json=payload)
        if resp.status_code >= 400:
            raise AetherError(resp.status_code, resp.text)
        body = resp.json()
        return SearchResponse(
            query=body["query"],
            hits=[SearchHit(**h) for h in body.get("hits", [])],
            total_hits=body["total_hits"],
            latency_ms=body["latency_ms"],
        )


__all__ = ["AetherClient", "AetherError", "SearchHit", "SearchResponse"]
__version__ = "0.1.0"
