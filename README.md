# aether-developer

Everything you need to call [Aether](https://aether.evidinvest.com) — the
financial-vertical agent search engine — from your own code or your
favourite MCP-enabled IDE.

The repo holds two kinds of integration plus the docs that explain them:

1. **MCP wrapper** — `@evidinvest/aether-mcp`. Drop it into Claude
   Desktop, Cursor, Cline, or any stdio-MCP client and you can search SEC
   filings + earnings transcripts from chat.
2. **Client libraries** — small typed HTTP clients in TypeScript / Python
   (and more languages over time). For when you're building your own
   service instead of using an MCP-aware UI.

```
aether-developer/
├── docs/                    — how to use Aether for search / via MCP
├── mcp/                     — @evidinvest/aether-mcp (stdio MCP server)
├── clients/
│   ├── typescript/          — @evidinvest/aether-sdk
│   └── python/              — aether-sdk (PyPI)
└── examples/                — runnable demos + config snippets
```

## Quick start

### Cursor (one-click)

The hosted server speaks OAuth, so this installs with no API key:

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Aether&config=eyJ1cmwiOiJodHRwczovL2FldGhlci5ldmlkaW52ZXN0LmNvbS9tY3AifQ==)

Full Cursor guide (manual config, stdio fallback, tool list): [`docs/cursor.md`](./docs/cursor.md).

### Claude Desktop / Cursor / Cline (MCP)

Add this to your client's MCP-server config:

```json
{
  "mcpServers": {
    "aether": {
      "command": "npx",
      "args": ["-y", "@evidinvest/aether-mcp"]
    }
  }
}
```

First run prints a device-code URL — open it, sign in, approve. Full guide:
[`docs/mcp.md`](./docs/mcp.md).

### TypeScript / Node

```bash
pnpm add @evidinvest/aether-sdk
```

```ts
import { AetherClient } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });
const { hits } = await aether.search({ query: "Apple supply-chain risk", limit: 5 });
```

Full guide: [`clients/typescript/README.md`](./clients/typescript/README.md).

### Python

```bash
pip install aether-sdk
```

```python
from aether import AetherClient

with AetherClient(api_key="ak_...") as aether:
    result = aether.search(query="Apple supply-chain risk", limit=5)
    for hit in result.hits:
        print(hit.score, hit.section_title)
```

Full guide: [`clients/python/README.md`](./clients/python/README.md).

## Docs

- [`docs/search.md`](./docs/search.md) — request/response shapes, auth, schemas.
- [`docs/mcp.md`](./docs/mcp.md) — MCP setup for Claude Desktop, Cursor, Cline, env overrides.

## Get an API key

https://aether.evidinvest.com/developer/keys

## Contribute a client library

The TypeScript and Python clients are intentionally tiny — one bearer-token
fetch wrapper + typed shapes for `/v1/search`. Porting to Go, Rust, Java,
etc. should fit in ~150 lines. Open a PR under `clients/<lang>/`.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
