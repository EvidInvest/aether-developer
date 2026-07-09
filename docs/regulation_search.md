# Searching EU financial regulation

`regulation_search` runs hybrid BM25 + dense-vector retrieval over the
**EU financial-regulation canon** — 29 acts, ~13,260 citable chunks:

- **Markets & securities** — MiFID II, MiFIR, MAR, Prospectus, EMIR, CSDR, Short-Selling, SFTR, Benchmarks
- **Crypto & operational resilience** — MiCA, DORA
- **Banking & prudential** — CRR, CRD IV, BRRD, SRMR
- **Funds** — UCITS, AIFMD
- **Payments & insurance** — PSD2, Solvency II, IDD
- **Sustainable finance** — SFDR, Taxonomy, CSRD
- **AML package (2024)** — AMLR, AMLAR, AMLD6, Transfer-of-Funds Regulation
- **Other** — Credit Rating Agencies, GDPR

Each hit is a citable unit (an Article-paragraph, recital, or annex block) with
a human breadcrumb (e.g. `MiCA 2023/1114 · Art. 4 · para. 1`), the EUR-Lex
ELI URI, and a direct source link. Scoped to financial regulation, not all EU law.

## Auth

Bearer token — an API key (`aether_ak_…`) from
https://aether.evidinvest.com/developer/keys or an OAuth access token from the
device-code flow (used by [`@evidinvest/aether-mcp`](../mcp/README.md)). Pass it
as `Authorization: Bearer <token>`. Anonymous calls work but are rate-limited.

## Request

```http
POST https://api.aether.evidinvest.com/v1/tools/regulation_search
Authorization: Bearer aether_ak_...
Content-Type: application/json

{
  "query": "best execution obligations for investment firms",
  "limit": 5
}
```

All filters are top-level and optional — omit them to search the whole corpus.

| Field | Type | Notes |
|---|---|---|
| `query` | string (required) | Natural-language query. |
| `limit` | int 1–50, default 10 | Max hits returned. |
| `profile` | `"bm25"` \| `"hybrid"`, default `"hybrid"` | Hybrid adds dense vectors; falls back to BM25 if the embedder is unavailable. |
| `celex` | string \| string[] | Restrict to one or more acts by CELEX, e.g. `"32014L0065"` (MiFID II), `"32023R1114"` (MiCA), `"32013R0575"` (CRR). |
| `doc_type` | string | `regulation` \| `directive` \| `rts` \| `its` \| `decision`. |
| `article` | string | Single-article filter, e.g. `"27"` or `"12a"`. |
| `chunk_type` | string | `paragraph` \| `article_intro` \| `recital` \| `table` \| `annex`. |
| `aml_topics` | string \| string[] | AML topic tag(s): `cdd` \| `edd` \| `pep` \| `str_reporting` \| `governance` \| `transaction_monitoring`. |
| `prefer_consolidated` | bool, default false | Favour EUR-Lex consolidated text over the original OJ text at equal relevance (hybrid only). Auditors wanting the as-published OJ text leave it off. |

## Response

```json
{
  "query": "reverse solicitation rules for crypto-asset service providers",
  "results": [
    {
      "doc_id": "316eec6c-df7d-5c31-b601-42f003a6f4da",
      "celex": "32023R1114",
      "doc_type": "regulation",
      "breadcrumb": "2023/1114 · Recital (75)",
      "article": "",
      "paragraph": "",
      "chunk_type": "recital",
      "aml_topics": [],
      "is_consolidated": false,
      "text": "(75) This Regulation should not affect the possibility for persons established in the Union to receive crypto-asset services by a third-country firm on their own initiative ...",
      "eli_uri": "http://data.europa.eu/eli/reg/2023/1114/oj",
      "source_url": "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114",
      "citation": "2023/1114 · Recital (75)",
      "confidence": 1.0,
      "retrieval": {
        "profile": "hybrid",
        "ranking": "hybrid",
        "rel": 0.5278,
        "vespa_step_ms": 52,
        "vespa_total": 399
      }
    }
  ],
  "total": 399,
  "source": "aether-vespa-regulation-hybrid",
  "latency_ms": 380
}
```

When you pass a `celex` filter, the normalized list is echoed back as a
top-level `celex_filter` array. `confidence` is the page-relative min–max
normalization of `rel`; `total` is the full match count in the corpus.

## Direct HTTP examples (curl)

```bash
# Whole corpus — no filter
curl -sS https://api.aether.evidinvest.com/v1/tools/regulation_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"MiFID II best execution requirements","limit":5}' | jq .

# Scope to one act (CRR) and a single article
curl -sS https://api.aether.evidinvest.com/v1/tools/regulation_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"own funds requirements","celex":"32013R0575","limit":5}' | jq .
```

## Via MCP

Through [`@evidinvest/aether-mcp`](../mcp/README.md), `regulation_search` is
auto-discovered alongside the other tools — ask a Claude/Cursor/Cline client
something like *"What does MiCA say about reverse solicitation by third-country
crypto firms?"* and it picks the tool and returns cited passages.
