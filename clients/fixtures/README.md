# Response fixtures

Real envelopes captured from `https://api.aether.evidinvest.com` on
2026-09-11, one per shape the SDKs have to get right. `text` is truncated and
`metadata` is trimmed to the documented fields; nothing else is edited. Both
the Python and the TypeScript test suites read these same files, so the two
clients are pinned to one source of truth.

| File | Call | What it pins |
|---|---|---|
| `financial_search_scoped.json` | `{"query":"data center revenue growth drivers","issuer":{"ticker":"NVDA"},"fiscal_year":2027}` | `scope: "issuer"` and **no** `quality_caveat` — the only combination that guarantees a filtered answer. `fiscal_year_semantics: "dei_fiscal_year_focus"`, `dedupe_dropped: 131` of a 150 pool. |
| `financial_search_cross_company.json` | `{"query":"HBM high bandwidth memory supply agreement","scope":"cross_company"}` | `scope: "cross_company"` **with** the caveat text, and `total: 2000` — the candidate cap, not a corpus count. |
| `financial_search_fetch.json` | `{"issuer":{"ticker":"NVDA"},"form_type":["10-Q"],"fiscal_year":2027}` | `mode: "fetch"`, `source: "aether-pg-fetch"`, and **no `confidence` on any hit**. `total` is matching chunks (128), not returned rows. |
| `financial_search_body_offset.json` | `{"query":"TSMC monthly net revenue","issuer":{"ticker":"TSM"}}` | A chunk whose first **1,462** characters are the EDGAR cover page. Crop from `body_offset`, not from 0. |
| `search_unified.json` | `{"query":"data center revenue","issuer":{"ticker":"NVDA"},"corpora":["sec"]}` | The unified tool's hit shape: `corpus`, `anchor_id`, top-level `diagnostics`. |

These are the calls in `docs/MCP-CHANGESET-2026-09-11.md` §5 (agentsearch repo).
Re-capture them after a contract change; do not hand-edit the numbers.
