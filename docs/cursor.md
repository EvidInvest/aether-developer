# Use Aether in Cursor

Aether is the **search engine whose user is an agent** — point Cursor's agent at
SEC filings, earnings transcripts, and EU financial regulation and get back
citation-complete payloads (exact section text, accession-numbered citation,
`sec.gov` source URL, confidence score), not HTML to parse.

## 1. One-click install (recommended — OAuth, no API key)

The production server (`https://aether.evidinvest.com/mcp`) is remote
streamable-HTTP with **OAuth 2.0**, so Cursor runs the sign-in flow for you — no
key to paste.

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Aether&config=eyJ1cmwiOiJodHRwczovL2FldGhlci5ldmlkaW52ZXN0LmNvbS9tY3AifQ==)

Raw deeplink:

```
cursor://anysphere.cursor-deeplink/mcp/install?name=Aether&config=eyJ1cmwiOiJodHRwczovL2FldGhlci5ldmlkaW52ZXN0LmNvbS9tY3AifQ==
```

(`config` is base64 of `{"url":"https://aether.evidinvest.com/mcp"}`.)

## 2. One-click install (npm / stdio fallback)

Runs the `@evidinvest/aether-mcp` wrapper locally; first launch prints a
device-code URL to sign in.

[![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Aether&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBldmlkaW52ZXN0L2FldGhlci1tY3AiXX0=)

```
cursor://anysphere.cursor-deeplink/mcp/install?name=Aether&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBldmlkaW52ZXN0L2FldGhlci1tY3AiXX0=
```

(`config` is base64 of `{"command":"npx","args":["-y","@evidinvest/aether-mcp"]}`.)

## 3. Manual config

Cursor → Settings → MCP → add a server, or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "aether": { "url": "https://aether.evidinvest.com/mcp" }
  }
}
```

Or the stdio wrapper with an explicit key (get one at
https://aether.evidinvest.com/developer/keys):

```json
{
  "mcpServers": {
    "aether": {
      "command": "npx",
      "args": ["-y", "@evidinvest/aether-mcp"],
      "env": { "AETHER_API_KEY": "ak_your_key_here" }
    }
  }
}
```

## Tools the agent gets

| Tool | What it does |
|---|---|
| `financial_search` | Hybrid search over SEC filings (10-K/10-Q/8-K, registration statements, press exhibits); returns section text + accession citation + source URL + score. |
| `transcript_search` | Earnings-call transcripts by speaker turn; CEO/CFO commentary with call date + speaker. |
| `regulation_search` | 29-act EU financial-regulation corpus (MiFID II, MiCA, DORA, AML) with article-level citations. |
| `list_partners` / `partner_search` / `partner_proxy_search` | Discover and query the two-sided data marketplace (third-party financial datasets). |
| `seller_signup` / `seller_publish_document` / `seller_register_endpoint` / `seller_list_my_documents` / `seller_list_my_endpoints` | Publish your own documents or paid proxy endpoints into the marketplace. |

## Data coverage

- **SEC filings** — 10-K / 10-Q / 8-K, registration statements, press exhibits; S&P 500 × ~10 years; 1.4M+ retrievable chunks.
- **Earnings-call transcripts** — segmented by speaker turn.
- **EU financial regulation** — 29 acts, article-level.
- **International filings** — Korea (DART) + Japan (EDINET) native-language coverage (query in Korean/Japanese).
- **Retrieval** — BM25 + dense vectors + cross-encoder reranking + ticker-aware boosting.

## Listing Aether in the Cursor directories

- **cursor.directory** — submit at https://cursor.directory/plugins/new (name `Aether`, repo `https://github.com/EvidInvest/aether-developer`, the OAuth deeplink above, a square logo).
- **First-party Cursor Marketplace** — https://cursor.com/marketplace/publish ingests this repo's `.cursor-plugin/plugin.json` (manually reviewed; repo must be public + OSS — it is, Apache-2.0).
- The "Add to Cursor" buttons above work **today** with no review.

Docs: https://cursor.com/docs/mcp · https://cursor.com/docs/context/mcp/install-links
