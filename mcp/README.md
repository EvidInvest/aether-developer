# `@evidinvest/aether-mcp`

Stdio MCP server for Aether. One-line install for Claude Desktop, Cursor, Cline, Continue — anything that spawns an MCP server as a subprocess over stdio.

> Aether is a financial-vertical agent search engine + marketplace: hybrid SEC filings + earnings-transcript retrieval over 1.4M+ chunks, plus a two-sided marketplace for third-party data. Production endpoint: `https://api.aether.evidinvest.com/mcp` (HTTP MCP).

This package wraps that HTTP endpoint so MCP clients that only speak stdio can still use it.

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

Auto-discovered on startup from `https://api.aether.evidinvest.com/v1/tools`:

| Tool | Purpose |
|---|---|
| `financial_search` | Hybrid SEC filing retrieval (BM25 + 256-d arctic-embed + cross-encoder rerank) |
| `transcript_search` | Earnings-call transcript segment search |
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
| `AETHER_BASE_URL` | `https://api.aether.evidinvest.com` | Override for local dev (`http://localhost:8787`) or staging |
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

Expected: handshake reply on stdout, plus a `tools/list` response with 10 tool definitions.

## Architecture

```
MCP client (Claude Desktop / Cursor / Cline)
       │ JSON-RPC over stdio
       ▼
@evidinvest/aether-mcp (this package, Node)
       │ HTTP MCP (REST-shaped, /v1/tools/<name>)
       │ optionally with `Authorization: Bearer …`
       ▼
Aether HTTP MCP @ api.aether.evidinvest.com/mcp
       │
       ├──► Vespa (filing_chunk + transcript_segment + partner_document)
       ├──► Embedder + reranker (GPU service)
       └──► Postgres (sellers, agents, marketplace state)
```

Tool defs are discovered once on startup; any new tools added upstream show up after restart without releasing a new npm version.

## License

Apache-2.0. Source: <https://github.com/EBD-Sweden/agentsearch/tree/main/clients/npm-mcp>
