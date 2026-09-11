# Aether REST API reference

Aether is a search engine built for agents: every hit is a ready-to-cite
evidence payload — exact primary-source text, accession-numbered citation,
sec.gov / EUR-Lex URL, confidence score. These endpoints are the **same tools**
the MCP server exposes, so anything an MCP client can do, plain HTTP can too.

```
POST https://api.aether.evidinvest.com/v1/tools/search              ← start here
POST https://api.aether.evidinvest.com/v1/tools/financial_search
POST https://api.aether.evidinvest.com/v1/tools/transcript_search
POST https://api.aether.evidinvest.com/v1/tools/regulation_search
```

## The rule: name the company, then narrow

Every company call takes an `issuer` — `{"ticker": "NVDA"}`, `{"cik":
"1045810"}`, or `{"company_name": "Sivers Semiconductors"}` for non-US filers
that have no US ticker. Name it and the call is **scoped**: the row set is
bounded before anything is scored, so it is fast and precise. Leave it out and
the call runs `scope: "cross_company"` — every issuer at once, ranked by
relevance only, and the response carries a `quality_caveat` saying so.

Two fields on every response tell you which you got:

```jsonc
"scope": "issuer",           // or "cross_company"
"quality_caveat": "…"        // present when the answer is not issuer-precise
```

**`scope: "issuer"` with no `quality_caveat` is the only guarantee you got a
filtered answer.** A caveat can arrive *alongside* `scope: "issuer"` — that
means the engine guessed the company from your query text and filtered on the
guess. The caveat names the guess so you can see whether it is the one you
meant. (Measured: the ordinary word "customers" resolves to Customers Bancorp.)

So keep the company in `issuer` and the question in `query`. Putting the ticker
in the query text appears to work, which is exactly what makes it risky:
nothing errors when the guess is wrong.

## Two modes: search and fetch

`query` is **optional**.

| | pass `query` | omit `query` |
|---|---|---|
| what happens | hits ranked by relevance | nothing is ranked |
| `mode` | `"search"` | `"fetch"` |
| order | best first | filing-date desc, then document order (1 < 1A < 1B < 2 < 9A < 10) |
| `confidence` | present | **absent** — there is no relevance signal, and 0 would read as "certainly irrelevant" |
| typical latency | ~1 s scoped, up to 15 s cross-company | tens of ms |

Fetch mode needs an identifier — `issuer.ticker`, `issuer.cik`,
`issuer.company_name`, `cik[]` or `accession_number` — optionally narrowed with
`form_type` / `fiscal_year` / `section`. A query-less call with no identifier is
a 400 that names the fields to pass.

If you already know which document you want, fetch it. "Give me NVDA's latest
10-Q sections" is not a search; ranking it only adds a way for the current
quarter's filing to come back 18th.

## `fiscal_year` is the issuer's own fiscal year

Not a calendar filed-date window. **NVIDIA FY2027 is the year ending Jan 2027,
filed during calendar 2026.** On filings it resolves from XBRL DEI fiscal-year
focus where the issuer tagged it, else from the issuer's fiscal year-end; on
earnings calls it is that corpus's own labelled year. A year that matches
nothing widens ±1 once and says so in `quality_caveat`. Which rule answered is
reported per hit as `metadata.retrieval.fiscal_year_semantics`.

## Auth

Bearer token in the `Authorization` header. Either a long-lived API key
(`ak_…`) from https://aether.evidinvest.com/developer/keys or an OAuth
access token (device-code / auth-code flows — what the MCP wrapper uses).

```
Authorization: Bearer ak_...
```

Anonymous calls work but are rate-limited; authenticated accounts get a real
quota (`/v1/agent/usage` shows consumption).

## Rate limits & free trial

Verify your email and you're put on the **trial tier** automatically, free for
**3 months**, no card required. When the trial ends you revert to the free tier
plus any paid credits. Start at
https://aether.evidinvest.com/developer/register.

---

## `search` — unified, auto-routing

Searches every corpus at once — SEC filings, Japan/EDINET and Korea/DART annual
reports, EU financial regulation, and earnings calls / press-release exhibits —
and merges them into one corpus-tagged result set. **Use this for most
questions**: you do not have to pick the right corpus, and it will not miss a
same-day 8-K earnings exhibit that lives in the transcript corpus.

```bash
curl -sS https://api.aether.evidinvest.com/v1/tools/search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"data center revenue","issuer":{"ticker":"NVDA"},"fiscal_year":2027,"limit":10}'
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `query` | string | — | Omit for fetch mode; an identifier is then required. |
| `issuer` | `{ticker?, cik?, company_name?}` | — | Forwarded to every corpus. Pass it. |
| `fiscal_year` | int \| int[] | — | The issuer's own fiscal year; forwarded to every corpus. |
| `scope` | `issuer` \| `cross_company` | `issuer` | |
| `tickers` | string[] | — | Legacy alias of `issuer`. One symbol reads as `issuer.ticker`; several is labelled `cross_company`. |
| `limit` | int ≤ 50 | 10 | |
| `corpora` | `sec` \| `jp` \| `kr` \| `regulation` \| `transcripts` | all | Omit to search everything. |
| `form_type` | string[] | — | Filing corpora; also narrows an omitted `corpora` to sec/jp/kr. |
| `accession_number` | string | — | Hard-scopes to one filing; counts as a fetch identifier. |
| `section` | string \| string[] | — | Case-insensitive substring of the label — `"Item 1A"` matches `"Item 1A. Risk Factors"`. |
| `quarter` | string \| string[] | — | Earnings-call corpus only. |
| `return_format` | `section` \| `chunk` \| `both` | `chunk` | Filing corpora only. |

Anything else is a **400 naming the field** — unsupported input is rejected,
never silently dropped.

## `financial_search` — SEC filings + non-US registries

Hybrid semantic + keyword retrieval over 10-K / 10-Q / 8-K, registration
statements, prospectuses, and press exhibits, **plus** non-US registries:
Sweden (Bolagsverket), Japan (EDINET), Korea (DART).

```bash
# search: ranked, issuer-scoped
curl -sS https://api.aether.evidinvest.com/v1/tools/financial_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"data center revenue growth drivers","issuer":{"ticker":"NVDA"},"fiscal_year":2027,"limit":5}'

# fetch: no query — NVDA's FY2027 10-Q sections in filing order, no ranking
curl -sS https://api.aether.evidinvest.com/v1/tools/financial_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"issuer":{"ticker":"NVDA"},"form_type":["10-Q"],"fiscal_year":2027,"limit":8}'

# a non-US issuer, named rather than tickered
curl -sS https://api.aether.evidinvest.com/v1/tools/financial_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"photonics revenue and order intake","issuer":{"company_name":"Sivers Semiconductors"},"limit":5}'
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `query` | string | — | Omit ⇒ fetch mode. |
| `issuer` | `{ticker?, cik?, company_name?}` | — | Pass it on every call. |
| `fiscal_year` | int \| int[] | — | The issuer's fiscal year. |
| `scope` | `issuer` \| `cross_company` | `issuer` | |
| `limit` | int ≤ 50 | 10 | Answers can be **shorter** than this — see below. |
| `profile` | `bm25` \| `hybrid` | `hybrid` | The `hybrid_rerank*` values are accepted as aliases of `hybrid` for one release; there is no reranker. Send nothing. |
| `return_format` | `section` \| `chunk` \| `both` | `section` | `section` returns the full filing section the match belongs to; `chunk` only the ~500-token window. |
| `accession_number` | string | — | `"0001045810-26-000075"`. Also a fetch identifier. |
| `cik` | string[] | — | Max 20. Also a fetch identifier. |
| `form_type` / `exclude_form_type` | string[] | — | e.g. `["10-Q"]`. |
| `section` | string \| string[] | — | Case-insensitive substring of the stored label. |
| `prefer_recent` | bool | — | Auto-enabled for latest/current/guidance queries. An explicit `fiscal_year` disables the recency prior outright. |
| `jurisdiction` | string[] | — | Non-US scoping: `["SE"]`, `["JP"]`, `["KR"]`. |
| `domain` | `public_equity` \| `supply_chain` \| `auto` | `auto` | **Deprecated passthrough** — retrieval never reads it. `supply_chain` means exactly `scope: "cross_company"`. |
| `fields` | string[] | — | Extra metadata fields to project. |

## `transcript_search` — earnings calls, speaker-attributed

Verbatim quotes from earnings-call transcripts and furnished press exhibits,
with speaker roles and point-in-time filters (find the *first* mention of a
topic, or what was said within a date window).

```bash
# search
curl -sS https://api.aether.evidinvest.com/v1/tools/transcript_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"gross margin guidance","issuer":{"ticker":"AAPL"},"fiscal_year":2025,"limit":5}'

# fetch: one named call, in spoken order
curl -sS https://api.aether.evidinvest.com/v1/tools/transcript_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"issuer":{"ticker":"NVDA"},"fiscal_year":2027,"quarter":"Q2","limit":20}'
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `query` | string | — | Omit ⇒ fetch mode (`issuer.ticker` is then required). |
| `issuer` | `{ticker?, cik?, company_name?}` | — | This corpus is keyed on **ticker**. |
| `fiscal_year` | int \| int[] | — | The segment's own labelled fiscal year — NVDA FY2027 calls ran in calendar 2026. |
| `scope` | `issuer` \| `cross_company` | `issuer` | `cross_company` **drops** the ticker filter. |
| `quarter` | string \| string[] | — | `"Q2"` or `["Q1","Q2"]`. With `issuer.ticker` + `fiscal_year` it names one call. |
| `ticker` | string | — | Legacy alias of `issuer.ticker`. |
| `lookback_quarters` | int | — | e.g. `4` = last year of calls. |
| `speaker_role` | string | — | `CEO`, `CFO`, `Analyst`, … |
| `date_from` / `date_to` | ISO date | — | Inclusive bounds on the call date. |
| `order` | `relevance` \| `earliest` \| `latest` | `relevance` | Chronological sort for onset/"first mention" queries. |
| `source_type` | `press_release` \| `furnished_transcript` \| `asr_call` | — | Provenance filter. |
| `limit` | int ≤ 50 | 10 | |
| `profile` | `bm25` \| `hybrid` | `hybrid` | |

A known hole: some transcript documents are indexed without usable
ticker/call-date metadata, so a correctly-written scoped call cannot see them.
If a call you know exists comes back empty, retry `scope: "cross_company"`
before concluding it is gone.

## `regulation_search` — EU financial regulation

Article-level retrieval over 29 acts — MiFID II, MiCA, CRR, DORA, GDPR, the AML
package — EUR-Lex sourced, citations to the article/paragraph.

```bash
curl -sS https://api.aether.evidinvest.com/v1/tools/regulation_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"best execution obligations","celex":"32014L0065","article":"27","limit":5}'
```

| Field | Type | Notes |
|---|---|---|
| `query` | string | *required* — this is the one tool with no fetch mode. |
| `celex` | string \| string[] | **This corpus's anchor** — the equivalent of naming the issuer. `"32014L0065"` MiFID II, `"32023R1114"` MiCA, `"32022R2554"` DORA, `"32024R1624"` AMLR. With none, the call runs across all 29 acts as `cross_company` and is caveated. |
| `doc_type` | string | `regulation` \| `directive` \| `rts` \| `its` \| `decision`. |
| `article` | string | Single article label (Formex labels can be `"12a"`). |
| `chunk_type` | string | `paragraph` \| `article_intro` \| `recital` \| `table` \| `annex`. |
| `aml_topics` | string \| string[] | `cdd`, `edd`, `pep`, `str_reporting`, `governance`, … |
| `prefer_consolidated` | bool | Prefer EUR-Lex consolidated text over the original OJ text. |
| `limit` / `profile` | | As above. |

---

## Response shape

`financial_search` and `regulation_search`:

```json
{
  "query": "data center revenue growth drivers",
  "mode": "search",
  "domain": "auto",
  "results": [
    {
      "id": "0001045810-26-000075-item-2",
      "text": "…exact filing-section text…",
      "source": "sec/10-Q/0001045810-26-000075",
      "citation": "NVDA 10-Q 2026-08-26 (Item 2)",
      "as_of_date": "2026-08-26",
      "confidence": 0.528,
      "metadata": {
        "cik": "0001045810",
        "ticker": "NVDA",
        "company_name": "NVIDIA CORP",
        "form_type": "10-Q",
        "period_of_report": "2026-07-26",
        "section": "Item 2",
        "accession_number": "0001045810-26-000075",
        "source_url": "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000075/nvda-20260726.htm",
        "retrieval": {
          "mode": "search",
          "issuer_how": "explicit_ticker",
          "fiscal_year_semantics": "dei_fiscal_year_focus",
          "candidate_pool": 150,
          "dedupe_dropped": 131,
          "junk_dropped": 1
        }
      }
    }
  ],
  "total": 415,
  "source": "aether-pg-hybrid",
  "scope": "issuer",
  "latency_ms": 1074
}
```

The unified `search` returns the same evidence with a corpus tag and the two
fields you would otherwise dig out of `metadata.retrieval` lifted to the top of
each hit:

```json
{
  "id": "…", "corpus": "sec", "corpus_label": "SEC filings",
  "citation": "NVDA 10-K 2024-02-21 (Item 7)",
  "text": "…", "source_url": "https://www.sec.gov/…",
  "confidence": 0.61, "as_of_date": "2024-02-21", "anchor_id": "…",
  "body_offset": 1462,
  "diagnostics": { "candidate_pool": 150, "dedupe_dropped": 80, "junk_dropped": 0,
                   "mode": "search", "issuer_how": "explicit_ticker" }
}
```

`transcript_search` returns speaker turns, keyed `segment_id` rather than `id`,
with `ticker` / `fiscal_year` / `quarter` / `call_date` / `speaker_name` /
`speaker_role` at the top level of each hit.

### Reading a response

1. **Check `scope` and `quality_caveat` first.** They are the contract. `source`
   (`aether-pg-hybrid` / `aether-pg-bm25` / `aether-pg-fetch`), `profile`,
   `domain` and everything under `retrieval` are diagnostics — report them,
   never branch on them.
2. **Crop excerpts from `body_offset`, not from character 0.** When a chunk
   opens with an EDGAR cover page, `body_offset` is where the real body starts.
   On a TSMC monthly-revenue 6-K that is 1,462 characters in — render from 0 and
   your citation card reads "UNITED STATES SECURITIES AND EXCHANGE COMMISSION".
   Absent means the text opens with its own body.
3. **`confidence` is a relative score, not a threshold.** It is derived from the
   engine's fused score; do not gate rendering on a fixed cut-off, and
   re-baseline anything that stored one before 2026-09-11. In fetch mode it is
   absent by design.
4. **Fewer results than `limit` is normal.** Near-duplicates are suppressed
   rather than padded over — a `limit: 10` call on an issuer whose corpus is one
   paragraph filed forty times returns the distinct handful. Do not treat
   `results.length < limit` as an error.
5. **`total` is a count of matching chunks, not of returned rows** — use it to
   page. On a cross-company search it is the candidate cap (2,000), not a corpus
   count.
6. **An empty `results` array means "not in the corpus".** The API never
   fabricates.

`text` is the verbatim primary-source passage, and `citation` +
`metadata.source_url` make it verifiable in one click. (`retrieval.vespa_step_ms`
and `vespa_total` are legacy key names for engine timing counters, kept
deliberately so existing log queries keep working.)

### Timeouts and errors

Budget **~1 s for a scoped search, ~50 ms for a fetch, and up to 15 s for a
cross-company call** — do not set a client timeout below ~20 s on any path that
can go cross-company.

Errors are JSON: `400 {"error":"invalid_input","details":…}` — including
unsupported fields, which are named rather than ignored — `429` when
rate-limited, `5xx {"error":"tool_failed"}`.

`GET /v1/tools` returns the live catalog with every schema. It is edge-cached
for 300 s, so give a fresh deploy a few minutes.

## Client libraries

| Language | Install | Docs |
|---|---|---|
| TypeScript / Node | `pnpm add @evidinvest/aether-sdk` | [`clients/typescript`](../clients/typescript/README.md) |
| Python | `pip install evidinvest-aether-sdk` | [`clients/python`](../clients/python/README.md) |
| Anything else | plain HTTP (above) — a client is ~150 lines, PRs welcome | [`clients/`](../clients/) |
| MCP (ChatGPT / Claude / Cursor) | remote URL or `npx -y @evidinvest/aether-mcp` | [`mcp.md`](./mcp.md) |
