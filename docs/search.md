# Aether REST API reference

Aether is a search engine built for agents: every hit is a ready-to-cite
evidence payload — exact primary-source text, accession-numbered citation,
sec.gov / EUR-Lex URL, confidence score. Three endpoints cover the corpus,
and they are the **same tools** the MCP server exposes, so anything an MCP
client can do, plain HTTP can too.

```
POST https://api.aether.evidinvest.com/v1/tools/financial_search
POST https://api.aether.evidinvest.com/v1/tools/transcript_search
POST https://api.aether.evidinvest.com/v1/tools/regulation_search
```

## Auth

Bearer token in the `Authorization` header. Either a long-lived API key
(`ak_…`) from https://aether.evidinvest.com/developer/keys or an OAuth
access token (device-code / auth-code flows — what the MCP wrapper uses).

```
Authorization: Bearer ak_...
```

Anonymous calls work but are rate-limited; authenticated accounts get a real
quota (`/v1/agent/usage` shows consumption).

---

## `financial_search` — SEC filings + non-US registries

Hybrid semantic + keyword retrieval with cross-encoder reranking and
ticker-aware boosting over 10-K / 10-Q / 8-K, registration statements,
prospectuses, and press exhibits (~10 years, S&P 500 and beyond), **plus**
non-US registries: Sweden (Bolagsverket), Japan (EDINET), Korea (DART).

```bash
curl -sS https://api.aether.evidinvest.com/v1/tools/financial_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"Apple revenue concentration risk","limit":5}'
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `query` | string | *required* | Natural-language query. |
| `domain` | `public_equity` \| `supply_chain` \| `auto` | `auto` | `supply_chain` = cross-company supplier/customer evidence. |
| `limit` | int ≤ 50 | 10 | |
| `profile` | `bm25` \| `hybrid` \| `hybrid_rerank` \| `hybrid_rerank_tickerprior` | `hybrid_rerank_tickerprior` | Retrieval profile; the default is the production winner. |
| `return_format` | `section` \| `chunk` \| `both` | `section` | `section` returns the full filing section the match belongs to; `chunk` only the ~500-token window. |
| `jurisdiction` | string[] | — | Non-US scoping: `["SE"]`, `["JP"]`, `["KR"]`. Omit for US SEC (default). |
| `fields` | string[] | — | Extra metadata fields to project. |

## `transcript_search` — earnings calls, speaker-attributed

Verbatim quotes from earnings-call transcripts and furnished press exhibits,
with speaker roles and point-in-time filters (find the *first* mention of a
topic, or what was said within a date window).

```bash
curl -sS https://api.aether.evidinvest.com/v1/tools/transcript_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"Blackwell demand","ticker":"NVDA","order":"earliest","limit":5}'
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `query` | string | *required* | |
| `ticker` | string | — | Uppercase symbol. |
| `lookback_quarters` | int | — | e.g. `4` = last year of calls. |
| `speaker_role` | string | — | `CEO`, `CFO`, `Analyst`, … |
| `date_from` / `date_to` | ISO date | — | Inclusive bounds on the call date. |
| `order` | `relevance` \| `earliest` \| `latest` | `relevance` | Chronological sort for onset/"first mention" queries. |
| `source_type` | `press_release` \| `furnished_transcript` \| `asr_call` | — | Provenance filter. |
| `limit` | int ≤ 50 | 10 | |
| `profile` | `bm25` \| `hybrid` | `hybrid` | |

## `regulation_search` — EU financial regulation

Article-level retrieval over MiFID II, MiCA, DORA, and the AML package
(EUR-Lex sourced, citations to the article/paragraph).

```bash
curl -sS https://api.aether.evidinvest.com/v1/tools/regulation_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"stablecoin issuer own funds requirements","limit":5}'
```

| Field | Type | Notes |
|---|---|---|
| `query` | string | *required* |
| `celex` | string \| string[] | Scope to act(s) by CELEX number, e.g. `"32024R1624"`. |
| `doc_type` | string | `regulation` \| `directive` \| `rts` \| `its` \| `decision`. |
| `article` | string | Single article label (Formex labels can be `"12a"`). |
| `chunk_type` | string | `paragraph` \| `article_intro` \| `recital` \| `table` \| `annex`. |
| `aml_topics` | string \| string[] | `cdd`, `edd`, `pep`, `str_reporting`, `governance`, … |
| `prefer_consolidated` | bool | Prefer EUR-Lex consolidated text over the original OJ text. |
| `limit` / `profile` | | As above. |

---

## Response shape (all three tools)

```json
{
  "query": "Apple revenue concentration risk",
  "domain": "auto",
  "results": [
    {
      "id": "0000320193-25-000079-item-1a",
      "text": "…exact filing-section text…",
      "source": "sec/10-K/0000320193-25-000079",
      "citation": "AAPL 10-K 2025-10-31 (Item 1A)",
      "as_of_date": "2025-10-31",
      "confidence": 0.83,
      "metadata": {
        "cik": "0000320193",
        "ticker": "AAPL",
        "company_name": "Apple Inc.",
        "form_type": "10-K",
        "period_of_report": "2025-09-27",
        "section": "Item 1A",
        "accession_number": "0000320193-25-000079",
        "source_url": "https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm"
      }
    }
  ],
  "total": 963,
  "source": "vespa",
  "latency_ms": 1240
}
```

The contract that matters: **`text` is the verbatim primary-source passage**,
`citation` + `metadata.source_url` make it verifiable in one click, and an
empty `results` array means "not in the corpus" — the API never fabricates.

Errors are JSON: `400 {"error":"invalid_input", "details":…}`,
`429` when rate-limited, `5xx {"error":"tool_failed"}`.

## Client libraries

| Language | Install | Docs |
|---|---|---|
| TypeScript / Node | `pnpm add @evidinvest/aether-sdk` | [`clients/typescript`](../clients/typescript/README.md) |
| Python | `pip install aether-sdk` | [`clients/python`](../clients/python/README.md) |
| Anything else | plain HTTP (above) — a client is ~150 lines, PRs welcome | [`clients/`](../clients/) |
| MCP (ChatGPT / Claude / Cursor) | remote URL or `npx -y @evidinvest/aether-mcp` | [`mcp.md`](./mcp.md) |
