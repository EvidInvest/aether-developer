# Using Aether for search

Aether is a financial-vertical search engine. One endpoint does most of the
work: `POST /v1/search`. Hybrid BM25 + dense vectors + cross-encoder
reranking over SEC filings (10-K / 10-Q / 8-K), earnings transcripts, and
seller-contributed corpora.

## Auth

Bearer token. Either a long-lived API key (`ak_…`) from
https://aether.evidinvest.com/developer/keys or an OAuth access token from
the device-code flow (used by [`@evidinvest/aether-mcp`](../mcp/README.md)).
Pass it as `Authorization: Bearer <token>`.

Anonymous calls work but are rate-limited.

## Request

```http
POST https://aether.evidinvest.com/v1/search
Authorization: Bearer ak_...
Content-Type: application/json

{
  "query": "Apple revenue concentration risk in China",
  "limit": 10,
  "tickers": ["AAPL"],
  "schemas": ["filing_chunk", "transcript_chunk"]
}
```

| Field | Type | Notes |
|---|---|---|
| `query` | string (required) | Natural-language search query. |
| `limit` | int 1–50, default 10 | Max hits returned. |
| `tickers` | string[] | Bias towards specific issuers. Uppercase symbols. |
| `schemas` | string[] | Restrict to `filing_chunk`, `transcript_chunk`, etc. |

## Response

```json
{
  "query": "...",
  "hits": [
    {
      "id": "chunk-...",
      "schema": "filing_chunk",
      "score": 0.873,
      "ticker": "AAPL",
      "cik": "0000320193",
      "section_title": "Item 1A. Risk Factors",
      "snippet": "A significant portion of the Company's revenue ...",
      "source_url": "https://www.sec.gov/Archives/edgar/...",
      "filed_at": "2025-10-31"
    }
  ],
  "total_hits": 127,
  "latency_ms": 187
}
```

## Client libraries

| Language | Install | Docs |
|---|---|---|
| TypeScript / Node | `pnpm add @evidinvest/aether-sdk` | [`clients/typescript`](../clients/typescript/README.md) |
| Python | `pip install aether-sdk` | [`clients/python`](../clients/python/README.md) |
| MCP (Claude Desktop / Cursor / Cline) | `npx -y @evidinvest/aether-mcp` | [`mcp/README.md`](../mcp/README.md) |

## Direct HTTP example (curl)

```bash
curl -sS https://aether.evidinvest.com/v1/search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"supply chain risk Taiwan","limit":5}' | jq .
```
