# aether-developer

Everything you need to connect [Aether](https://aether.evidinvest.com) — the
search engine built for agents, over SEC filings, earnings-call transcripts,
and EU financial regulation — to your LLM, your IDE, or your own code.

Every result is a ready-to-cite evidence payload: the exact filed passage,
an accession-numbered citation, the sec.gov / EUR-Lex link, and a confidence
score. No filing, no answer — your agent stops inventing numbers.

```
aether-developer/
├── docs/                — connection guides + REST API reference
│   ├── chatgpt.md       — ChatGPT Developer Mode setup
│   ├── mcp.md           — Claude / Cursor / Cline / any MCP client
│   ├── cursor.md        — Cursor specifics (one-click install)
│   └── search.md        — REST API reference (/v1/tools/*)
├── skills/              — Agent Skills (drop into ~/.claude/skills)
├── mcp/                 — @evidinvest/aether-mcp (stdio MCP server, npm)
├── clients/
│   ├── typescript/      — @evidinvest/aether-sdk (npm)
│   └── python/          — aether-sdk (PyPI)
└── examples/            — runnable demos + config snippets
```

## Connect your LLM (no code)

**MCP endpoint:** `https://api.aether.evidinvest.com/mcp` · Auth: OAuth
(sign in when your client prompts — free account).

| Client | How | Guide |
|---|---|---|
| **ChatGPT** | Settings → Apps & Connectors → Developer mode → Create connector with the URL above | [`docs/chatgpt.md`](./docs/chatgpt.md) |
| **Claude (web/Desktop)** | Settings → Connectors → Add custom connector with the URL above | [`docs/mcp.md`](./docs/mcp.md) |
| **Claude Code** | `claude mcp add --transport http aether https://api.aether.evidinvest.com/mcp` | [`docs/mcp.md`](./docs/mcp.md) |
| **Cursor** | [![Add to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](cursor://anysphere.cursor-deeplink/mcp/install?name=Aether&config=eyJ1cmwiOiJodHRwczovL2FldGhlci5ldmlkaW52ZXN0LmNvbS9tY3AifQ==) | [`docs/cursor.md`](./docs/cursor.md) |
| **Cline / Continue / other stdio MCP** | `npx -y @evidinvest/aether-mcp` in the client's MCP config | [`docs/mcp.md`](./docs/mcp.md) |

Then ask: *"What does Apple's latest 10-K say about supply-chain risk?
Quote the passage with the sec.gov link."*

## Teach your agent the craft (skills)

MCP gives the agent the tools; the [`skills/`](./skills/) directory teaches
it the craft — tool routing, citation discipline, point-in-time transcript
retrieval:

```bash
cp -r skills/aether-research ~/.claude/skills/   # Claude Code, personal
```

See [`skills/README.md`](./skills/README.md) for Claude Desktop / other
frameworks.

## Call the API from code

Three REST endpoints — the same tools MCP exposes
([full reference](./docs/search.md)):

```
POST /v1/tools/financial_search    POST /v1/tools/transcript_search    POST /v1/tools/regulation_search
```

### TypeScript / Node

```bash
pnpm add @evidinvest/aether-sdk
```

```ts
import { AetherClient } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });
const out = await aether.financialSearch({ query: "Apple supply-chain risk", limit: 5 });
for (const c of out.results) console.log(c.citation, c.metadata?.source_url);
```

### Python

```bash
pip install aether-sdk
```

```python
from aether import AetherClient

with AetherClient(api_key="ak_...") as aether:
    out = aether.financial_search(query="Apple supply-chain risk", limit=5)
    for c in out.results:
        print(c.citation, c.metadata.get("source_url"))
```

### curl / any language

```bash
curl -sS https://api.aether.evidinvest.com/v1/tools/financial_search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"supply chain risk Taiwan","limit":5}' | jq .
```

## Get an API key

https://aether.evidinvest.com/developer/keys — anonymous calls work but are
rate-limited; keys are free.

## What's in the corpus

- **SEC filings** — 10-K / 10-Q / 8-K, registration statements,
  prospectuses, press exhibits; ~10 years of S&P 500 and beyond.
- **Non-US registries** — Sweden (Bolagsverket), Japan (EDINET),
  Korea (DART) annual reports; scope with `jurisdiction: ["SE"|"JP"|"KR"]`.
- **Earnings calls** — speaker-attributed transcripts + furnished press
  exhibits, with point-in-time filters (`order: "earliest"` finds first
  mentions).
- **EU regulation** — MiFID II, MiCA, DORA, the AML package; article-level
  citations.

## Contribute a client library

The TypeScript and Python clients are intentionally tiny — one bearer-token
fetch wrapper + typed shapes for the three `/v1/tools/*` endpoints. Porting
to Go, Rust, Java, etc. is ~150 lines. Open a PR under `clients/<lang>/`.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
