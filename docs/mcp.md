# Connect Aether to your agent (MCP)

Aether speaks [Model Context Protocol](https://modelcontextprotocol.io), so
any MCP-enabled client — **ChatGPT (Developer Mode), Claude (web / Desktop /
Code), Cursor, Cline, Continue** — can search SEC filings, earnings calls, and
EU regulation with cited answers.

There are two ways to connect. **Use the remote server unless you have a
reason not to** — nothing to install, OAuth in the browser, always current.

| | Remote (recommended) | Local stdio |
|---|---|---|
| Endpoint | `https://api.aether.evidinvest.com/mcp` | `npx -y @evidinvest/aether-mcp` |
| Install | nothing | Node ≥ 18 |
| Auth | OAuth (browser prompt) | OAuth device-code (or `AETHER_API_KEY`) |
| Works in | ChatGPT, Claude web/Desktop/Code, Cursor | Claude Desktop/Code, Cursor, Cline, Continue |

---

## Remote server — per client

### ChatGPT (Developer Mode)

See the dedicated guide: [`chatgpt.md`](./chatgpt.md).

### Claude (web / Desktop) — custom connector

1. **Settings → Connectors → Add custom connector**.
2. Name `Aether`, URL `https://api.aether.evidinvest.com/mcp`.
3. Sign in when prompted (OAuth), approve.
4. Ask: *"What did Micron's CFO say about HBM capacity last quarter? Cite the filing."*

### Claude Code (CLI)

```bash
claude mcp add --transport http aether https://api.aether.evidinvest.com/mcp
```

### Cursor

One-click (remote, OAuth — no API key):

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Aether&config=eyJ1cmwiOiJodHRwczovL2FldGhlci5ldmlkaW52ZXN0LmNvbS9tY3AifQ==)

or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aether": { "url": "https://api.aether.evidinvest.com/mcp" }
  }
}
```

Full Cursor guide (stdio fallback, tool list): [`cursor.md`](./cursor.md).

---

## Local stdio server

For clients without remote-MCP support, or when you want env-var control
(API-key auth, staging base URL):

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

- **Claude Desktop**: Settings → Developer → Edit config
  (`claude_desktop_config.json`), paste the block above, restart.
- **Cline / Continue**: same JSON shape in each client's MCP config block.
- **Claude Code**: `claude mcp add aether -- npx -y @evidinvest/aether-mcp`

On first run the server prints an OAuth device-code URL to stderr — open it,
sign in at https://aether.evidinvest.com, approve. The token is cached in
`~/.config/aether/credentials.json` and refreshed automatically.

Working snippets: [`examples/claude-desktop/`](../examples/claude-desktop/).

The stdio wrapper auto-discovers every tool from
`${AETHER_BASE_URL}/v1/tools` on startup, so new tools appear without a
package update.

### Environment overrides (stdio only)

| Var | Default | Purpose |
|---|---|---|
| `AETHER_BASE_URL` | `https://api.aether.evidinvest.com` | Point at staging / a local server. |
| `AETHER_CLIENT_ID` | `aether-mcp-cli` | OAuth client ID (first-party). |
| `AETHER_SCOPE` | `aether.search aether.search.partners …` | OAuth scopes requested. |
| `AETHER_API_KEY` | — | Skip OAuth; use this API key as a Bearer token. |
| `AETHER_NO_AUTH` | — | `1` = call anonymously (rate-limited). |
| `AETHER_CREDENTIALS_PATH` | `~/.config/aether/credentials.json` | Override token cache path. |

---

## Tools exposed

| Tool | What it searches | Typical ask |
|---|---|---|
| `financial_search` | SEC filings (10-K/10-Q/8-K, S-1/424B prospectuses, press exhibits; ~10y S&P 500 +) **plus** non-US registries — Sweden/Bolagsverket, Japan/EDINET, Korea/DART | "Apple's supplier-concentration risk, with the exact 10-K passage" |
| `transcript_search` | Earnings-call transcripts + furnished press exhibits, speaker-attributed, point-in-time filters | "When did NVIDIA management first mention Blackwell? Earliest mention" |
| `regulation_search` | EU financial regulation — 29 acts (MiFID II, MiFIR, MAR, MiCA, CRR, CRD, DORA, SFDR, GDPR, the AML package, …) — article-level; see [`regulation_search.md`](./regulation_search.md) | "MiCA's requirements for stablecoin issuers, cite the article" |
| `list_partners`, `partner_search`, `partner_proxy_search` | Marketplace: partner corpora (check per-call credit cost via `list_partners` first) | — |
| `seller_*` | Publish your own corpus/endpoint into the marketplace | — |

Every hit is a ready-to-cite payload: exact source text, accession-numbered
citation, sec.gov (or EUR-Lex) URL, and a confidence score. No web scraping,
no HTML parsing — if it's not in a filing, Aether says so instead of
hallucinating.

Prefer raw REST? The same tools are plain HTTP endpoints — see
[`search.md`](./search.md).
