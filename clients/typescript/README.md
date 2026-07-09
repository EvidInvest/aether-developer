# @evidinvest/aether-sdk

Tiny typed HTTP client for the [Aether](https://aether.evidinvest.com) REST
API — SEC filings, earnings-call transcripts, and EU financial regulation,
every hit a ready-to-cite payload (exact source text + accession-numbered
citation + sec.gov URL).

## Install

```bash
pnpm add @evidinvest/aether-sdk   # or npm i / yarn add
```

## Use

```ts
import { AetherClient } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });

// SEC filings (10-K/10-Q/8-K, prospectuses) + SE/JP/KR registries
const filings = await aether.financialSearch({
  query: "Apple revenue concentration risk",
  limit: 5,
});
for (const c of filings.results) {
  console.log(c.citation, "→", c.metadata?.source_url);
  console.log(c.text.slice(0, 200));
}

// Earnings calls — speaker-attributed, point-in-time
const calls = await aether.transcriptSearch({
  query: "Blackwell demand",
  ticker: "NVDA",
  order: "earliest", // find the FIRST mention
  limit: 5,
});

// EU regulation — MiFID II, MiCA, DORA, AML package (article-level)
const reg = await aether.regulationSearch({
  query: "stablecoin issuer own funds requirements",
  limit: 5,
});
```

Get an API key at https://aether.evidinvest.com/developer/keys (anonymous
calls work but are rate-limited). Full request/response reference:
[`docs/search.md`](../../docs/search.md).

## Why this exists

`@evidinvest/aether-mcp` already wraps the same API for MCP clients
(ChatGPT, Claude, Cursor, Cline, …). This SDK is for everything else —
plain Node scripts, Fastify/Next.js routes, workers, edge functions.

It's intentionally minimal: one bearer-token-aware fetch wrapper, typed
request/response shapes, no SDK-side retry/cache. Bring your own.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
