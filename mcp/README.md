# `@evidinvest/aether-mcp`

Stdio MCP server for Aether. One-line install for Claude Desktop, Cursor, Cline, Continue — anything that spawns an MCP server as a subprocess over stdio.

> Aether is a financial-vertical agent search engine + marketplace: hybrid retrieval over SEC filings + earnings transcripts (1.4M+ chunks) and the EU financial-regulation canon (29 acts — MiFID II, MiCA, CRR, DORA, GDPR, …), plus a two-sided marketplace for third-party data.

## Public surface — two hosts

| Host | Use |
|---|---|
| `https://aether.evidinvest.com` | MCP protocol (`/mcp`), OAuth + account creation (`/v1/oauth/*`, `/v1/agent/*`), marketing + dashboard. **Use this URL when telling an MCP client where Aether lives.** |
| `https://api.aether.evidinvest.com` | Search-engine tool calls only (`/v1/tools/*`). Direct REST surface for clients that don't want to speak MCP. |

This package wraps the HTTP endpoints so MCP clients that only speak stdio can still use Aether without thinking about which host serves what.

## Install

```bash
# No install needed — runs straight from npx:
npx -y @evidinvest/aether-mcp

# Or install globally for slightly faster startup:
npm install -g @evidinvest/aether-mcp
aether-mcp
```

## Configure your MCP client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

For higher rate limits + paid marketplace access, add your Aether API key:

```json
{
  "mcpServers": {
    "aether": {
      "command": "npx",
      "args": ["-y", "@evidinvest/aether-mcp"],
      "env": {
        "AETHER_API_KEY": "aether_ak_…"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` in your workspace, or `~/.cursor/mcp.json` globally:

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

### Cline / Continue / other clients

Any client that supports MCP stdio servers takes the same shape — name, command, args, optional env.

## Tools exposed

Auto-discovered on startup from `${AETHER_API_BASE_URL}/v1/tools` (defaults to `https://api.aether.evidinvest.com/v1/tools`):

| Tool | Purpose |
|---|---|
| `financial_search` | Hybrid SEC filing retrieval (BM25 + 256-d arctic-embed + cross-encoder rerank) |
| `transcript_search` | Earnings-call transcript segment search |
| `regulation_search` | EU financial-regulation search — 29-act canon (MiFID II, MiCA, CRR, CRD, DORA, SFDR, GDPR, AML package, …); citable Article-paragraphs/recitals with EUR-Lex breadcrumbs. [Docs](../docs/regulation_search.md) |
| `list_partners` | List marketplace sellers + per-call prices |
| `partner_search` | Search a partner's indexed corpus (Mode A, free) |
| `partner_proxy_search` | Route query to partner's API server-to-server (Mode B, per-call paid) |
| `seller_signup` | Register as a marketplace seller |
| `seller_publish_document` | Publish a document into Aether's index |
| `seller_register_endpoint` | Register a proxy endpoint |
| `seller_list_my_documents` | List own documents |
| `seller_list_my_endpoints` | List own endpoints |

## Environment

| Variable | Default | Effect |
|---|---|---|
| `AETHER_API_BASE_URL` | `https://api.aether.evidinvest.com` | Override host for tool calls (`/v1/tools/*`). Use `http://localhost:8787` for local dev. |
| `AETHER_MCP_BASE_URL` | `https://aether.evidinvest.com` | Override host for OAuth + account creation (`/v1/oauth/*`, `/v1/agent/*`). Use `http://localhost:8787` for local dev. |
| `AETHER_BASE_URL` | _deprecated_ | If set, overrides BOTH hosts. Kept for back-compat with `aether-mcp@0.2.x`. |
| `AETHER_API_KEY` | `(empty)` | If set, attached as `Authorization: Bearer <key>` to every tool call. Use a seller key (`aether_sk_…`) for seller actions OR an agent key (`aether_ak_…`) for higher search rate limits + paid proxy access. |

## Smoke-test from the command line

```bash
{
  echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0"}}}'
  sleep 0.2
  echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
  sleep 0.2
  echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
  sleep 1
} | npx -y @evidinvest/aether-mcp
```

Expected: handshake reply on stdout, plus a `tools/list` response with 11 tool definitions.

## Architecture

```
MCP client (Claude Desktop / Cursor / Cline)
       │ JSON-RPC over stdio
       ▼
@evidinvest/aether-mcp (this package, Node)
       │
       ├──► HTTPS  aether.evidinvest.com/v1/oauth/*      (device-code auth, token refresh)
       └──► HTTPS  api.aether.evidinvest.com/v1/tools/*  (tool discovery + calls)
                                  │
                                  ├──► Vespa (filing_chunk + transcript_segment + partner_document)
                                  ├──► Embedder + reranker (BAAI/bge-reranker-v2-m3 on CPU)
                                  └──► Postgres (sellers, agents, marketplace state)
```

MCP clients that want to skip this stdio wrapper can connect directly to the StreamableHTTP transport at `https://aether.evidinvest.com/mcp` — same surface, no Node subprocess needed.

Tool defs are discovered once on startup; any new tools added upstream show up after restart without releasing a new npm version.

## License

Apache-2.0. Source: <https://github.com/EvidInvest/aether-developer/tree/main/mcp>
