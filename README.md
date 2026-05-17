# aether-developer

Developer libraries and examples for **Aether** — financial-vertical agent
search engine (https://aether.evidinvest.com).

## Packages

| Package | Description |
|---|---|
| [`@evidinvest/aether-mcp`](./packages/mcp) | stdio MCP server. Lets Claude Desktop, Cursor, Cline, Continue, or any MCP-stdio client call Aether's tools via `npx -y @evidinvest/aether-mcp`. OAuth 2.0 device flow on first run. |
| [`@evidinvest/aether-sdk`](./packages/sdk) | Tiny TypeScript HTTP SDK over the Aether `/v1/*` REST API. Direct-call alternative to the MCP wrapper. |

## Quick start

```bash
# As an end user (Claude Desktop / Cursor):
#   Add to claude_desktop_config.json:
{
  "mcpServers": {
    "aether": {
      "command": "npx",
      "args": ["-y", "@evidinvest/aether-mcp"]
    }
  }
}

# As a developer building on top of the HTTP API:
pnpm add @evidinvest/aether-sdk
```

See [`examples/`](./examples) for runnable usage.

## Repo layout

```
aether-developer/
├── packages/
│   ├── mcp/      — @evidinvest/aether-mcp (stdio MCP wrapper)
│   └── sdk/      — @evidinvest/aether-sdk (HTTP TS SDK)
└── examples/
    └── node-search/  — minimal Node script that calls /v1/search via the SDK
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).
