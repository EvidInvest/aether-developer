# @evidinvest/aether-sdk

Tiny typed HTTP client for the [Aether](https://aether.evidinvest.com) REST API.

## Install

```bash
pnpm add @evidinvest/aether-sdk
```

## Use

```ts
import { AetherClient } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });

const { hits } = await aether.search({
  query: "Apple revenue concentration risk",
  tickers: ["AAPL"],
  limit: 5,
});

for (const h of hits) {
  console.log(h.score.toFixed(3), h.section_title, h.snippet?.slice(0, 120));
}
```

Get an API key at https://aether.evidinvest.com/developer/keys.

## Why this exists

`@evidinvest/aether-mcp` already wraps the same API for MCP-stdio clients
(Claude Desktop, Cursor, Cline, …). This SDK is for everything else —
plain Node scripts, Fastify/Next.js routes, workers, edge functions.

It's intentionally minimal: one bearer-token-aware fetch wrapper, typed
request/response shapes, no SDK-side retry/cache. Bring your own.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
