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

For higher rate limits + paid marketplace access, add your own Aether API key. Do not paste shared, demo, benchmark, or production keys into public docs:

```json
{
  "mcpServers": {
    "aether": {
      "command": "npx",
      "args": ["-y", "@evidinvest/aether-mcp"],
      "env": {
        "AETHER_API_KEY": "<YOUR_AETHER_API_KEY>"
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
| `search` | Unified: filings + Japan/EDINET + Korea/DART + EU regulation + earnings calls, auto-routed and corpus-tagged. Use this for most questions |
| `financial_search` | Hybrid SEC filing retrieval (BM25 + 256-d arctic-embed, fused in one score) |
| `transcript_search` | Earnings-call transcript segment search |
| `holdings_by_security` / `holdings_by_manager` | 13F ownership — who owns a stock, what a fund owns. Ownership questions do not go through search |
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
| `AETHER_API_KEY` | `(empty)` | Optional key attached as `Authorization: Bearer ***` to every tool call. Use an agent key for higher search rate limits and paid proxy access, or a seller key for seller actions. Generate your own key in the Aether dashboard; never reuse keys copied from docs, benchmarks, or examples. |

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

Expected: handshake reply on stdout, plus a `tools/list` response with 14 tool definitions.

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
                                  ├──► Postgres + pgvector (filing_chunk, transcript_segment,
                                  │    regulation_chunk, partner_document — 256-d vectors)
                                  ├──► Embedder (256-d arctic-embed; no reranker)
                                  └──► Postgres (sellers, agents, marketplace state)
```

MCP clients that want to skip this stdio wrapper can connect directly to the StreamableHTTP transport at `https://aether.evidinvest.com/mcp` — same surface, no Node subprocess needed.

### Tool definitions are fetched once, at startup

This wrapper is a pass-through: it calls `GET /v1/tools` a single time when the process starts and serves that list for the life of the process. It does not re-poll.

So when Aether changes a tool — new fields, new modes, reworded descriptions — **a running Claude Desktop / Cursor / Cline session keeps the old definitions until you restart it**. The agent will go on sending the shape it was told about, which is how a caller ends up still omitting `issuer` a week after the contract changed. Quit and reopen the client (or restart the MCP server from its settings) after any upstream contract change, then diff `tools/list` with the smoke test above. The public catalog is also edge-cached for 300 s, so give a fresh deploy a few minutes before concluding a field is missing.

New tools added upstream likewise show up after a restart, without releasing a new npm version.

## License

Apache-2.0. Source: <https://github.com/EvidInvest/aether-developer/tree/main/mcp>
