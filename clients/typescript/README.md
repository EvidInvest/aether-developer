# @evidinvest/aether-sdk

Tiny typed HTTP client for the [Aether](https://aether.evidinvest.com) REST
API — SEC filings, earnings-call transcripts, and EU financial regulation,
every hit a ready-to-cite payload (exact source text + accession-numbered
citation + sec.gov URL).

## Install

```bash
pnpm add @evidinvest/aether-sdk   # or npm i / yarn add
```

## The rule: name the company, then narrow

Pass `issuer` on every call — `{ ticker }`, `{ cik }`, or `{ company_name }`
for non-US filers with no US ticker. Then read `scope` and `quality_caveat` off
the response: **`scope: "issuer"` with no caveat is the only guarantee you got
a filtered answer.** Omit the issuer and the call searches every filer at once:
slower, relevance-ranked only, and caveated.

Keep the company in `issuer` and the question in `query`. Putting the ticker in
the query text appears to work — the engine infers a filer — which is exactly
why it is risky: nothing errors when the guess is wrong.

## Use

```ts
import { AetherClient } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });

// Unified — filings, JP/KR, EU regulation and earnings calls at once
const all = await aether.search({
  query: "data center revenue",
  issuer: { ticker: "NVDA" },
  fiscal_year: 2027, // NVIDIA's OWN fiscal year: the year ending Jan 2027
  limit: 10,
});
if (all.quality_caveat) console.warn(all.scope, all.quality_caveat);
for (const hit of all.results) {
  console.log(hit.corpus, hit.citation, hit.text.slice(hit.body_offset ?? 0, 200));
}

// SEC filings (10-K/10-Q/8-K, prospectuses) + SE/JP/KR registries
const filings = await aether.financialSearch({
  query: "supply-chain concentration risk",
  issuer: { ticker: "AAPL" },
  limit: 5,
});
for (const c of filings.results) {
  const start = c.metadata?.retrieval?.body_offset ?? 0; // skip the EDGAR cover
  console.log(c.citation, "→", c.metadata?.source_url);
  console.log(c.text.slice(start, start + 200));
}

// Earnings calls — speaker-attributed, point-in-time
const calls = await aether.transcriptSearch({
  query: "Blackwell demand",
  issuer: { ticker: "NVDA" },
  order: "earliest", // find the FIRST mention
  limit: 5,
});
console.log(calls.results[0]?.speaker_name, calls.results[0]?.call_date);

// EU regulation — anchor on the CELEX, this corpus's equivalent of an issuer
const reg = await aether.regulationSearch({
  query: "stablecoin issuer own funds requirements",
  celex: "32023R1114", // MiCA
  limit: 5,
});
```

## Fetch mode — don't rank a document you can name

`query` is optional. Omit it, pass an identifier plus `form_type` /
`fiscal_year` / `section` / `accession_number`, and you get that filing's
sections in filing order with no ranking — `mode: "fetch"`, tens of
milliseconds, and **no `confidence`** on any hit (nothing was scored).

```ts
const risks = await aether.financialSearch({
  issuer: { ticker: "AAPL" },
  form_type: ["10-K"],
  section: "Item 1A", // case-insensitive substring of the label
  limit: 5,
});
risks.mode; // "fetch"
risks.total; // matching CHUNKS, not returned rows — use it to page
```

Same on transcripts: `{ issuer: { ticker: "NVDA" }, fiscal_year: 2027, quarter:
"Q2" }` returns one call in spoken order.

## Reading a response

- **`scope` + `quality_caveat` are the contract.** `source`, `profile`,
  `domain` and everything under `metadata.retrieval` are diagnostics — report
  them, never branch on them.
- **Crop from `body_offset`.** Where a chunk opens with an EDGAR cover page,
  that is the offset in `text` where the body begins — 1,462 characters in on a
  TSMC monthly-revenue 6-K.
- **`confidence` is a relative score, not a threshold.** Do not gate rendering
  on a fixed cut-off; it is absent in fetch mode by design.
- **Fewer results than `limit` is normal** — near-duplicates are suppressed
  rather than padded over. Not an error.
- **Budget ~20 s** of client timeout on any path that can go cross-company.

Get an API key at https://aether.evidinvest.com/developer/keys (anonymous
calls work but are rate-limited). Full request/response reference:
[`docs/search.md`](../../docs/search.md). Changes:
[`CHANGELOG.md`](./CHANGELOG.md).

## Why this exists

`@evidinvest/aether-mcp` already wraps the same API for MCP clients
(ChatGPT, Claude, Cursor, Cline, …). This SDK is for everything else —
plain Node scripts, Fastify/Next.js routes, workers, edge functions.

It's intentionally minimal: one bearer-token-aware fetch wrapper, typed
request/response shapes, no SDK-side retry/cache. Bring your own.

## Develop

```bash
pnpm --filter @evidinvest/aether-sdk test        # fixtures, no network
pnpm --filter @evidinvest/aether-sdk typecheck
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
