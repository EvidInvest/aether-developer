# Using Aether via MCP

[Model Context Protocol](https://modelcontextprotocol.io) lets a Claude
client (Desktop, Cursor, Cline, Continue, …) spawn a small server as a
subprocess and call its tools over stdio. The Aether MCP wrapper is a
stdio MCP server that proxies to `https://api.aether.evidinvest.com`.

```
Claude Desktop  ──(stdio)──►  @evidinvest/aether-mcp  ──(HTTPS)──►  Aether API
```

You don't have to install anything globally — `npx -y` fetches the
latest version each time, caches it, and runs the binary.

## Setup — Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit config):

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

Restart Claude Desktop. On first run, the server prints an OAuth
device-code URL to stderr — open it, sign in at
https://aether.evidinvest.com, and approve. The token is cached in
`~/.config/aether/credentials.json` and refreshed automatically.

## Setup — Cursor / Cline / Continue

Same JSON shape, dropped into each client's MCP-server config block.
See [`examples/claude-desktop/`](../examples/claude-desktop/) for the
working snippet.

## Tools exposed

The wrapper auto-discovers every tool from `${AETHER_API_BASE_URL}/v1/tools`
on startup. The search tools today:

- **`financial_search`** — natural-language hybrid retrieval over SEC
  filings. Returns ranked chunks with snippets, section titles, filing URLs,
  and tickers.
- **`transcript_search`** — earnings-call transcript segment search.
- **`regulation_search`** — EU financial-regulation search over a 29-act
  corpus (MiFID II, MiFIR, MAR, MiCA, CRR, CRD, DORA, SFDR, GDPR, the EU AML
  package, …). Returns citable Article-paragraphs, recitals, and annex blocks
  with breadcrumbs + EUR-Lex links. See [`docs/regulation_search.md`](./regulation_search.md).

Plus the marketplace tools (`list_partners`, `partner_search`,
`partner_proxy_search`, and the `seller_*` actions).

Run one from the Claude UI by asking something like *"What does Apple's latest
10-K say about supply-chain risk in Taiwan?"* or *"What does MiCA say about
reverse solicitation?"* — Claude picks the right tool, the wrapper forwards to
`/v1/tools/<name>`, and the result flows back as tool output.

## Environment overrides

| Var | Default | Purpose |
|---|---|---|
| `AETHER_BASE_URL` | `https://api.aether.evidinvest.com` | Point at staging / a local MCP server. |
| `AETHER_CLIENT_ID` | `aether-mcp-cli` | OAuth client ID (first-party). |
| `AETHER_SCOPE` | `aether.search aether.search.partners …` | OAuth scopes requested. |
| `AETHER_API_KEY` | — | Skip OAuth; use this API key as a Bearer token. |
| `AETHER_NO_AUTH` | — | `1` = call anonymously (rate-limited). |
| `AETHER_CREDENTIALS_PATH` | `~/.config/aether/credentials.json` | Override token cache path. |
