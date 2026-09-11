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
│   └── search.md        — REST API reference (/v1/tools/*), the issuer contract, fetch mode
├── skills/              — Agent Skills (drop into ~/.claude/skills)
├── mcp/                 — @evidinvest/aether-mcp (stdio MCP server, npm)
├── clients/
│   ├── typescript/      — @evidinvest/aether-sdk (npm)
│   └── python/          — evidinvest-aether-sdk (PyPI)
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
Quote the passage with the sec.gov link."* Name the company in the
question — every tool takes an `issuer`, and naming it is what makes the
answer scoped rather than a relevance-ranked sweep of every filer.

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

Four REST endpoints — the same tools MCP exposes
([full reference](./docs/search.md)):

```
POST /v1/tools/search   ← start here (unified)
POST /v1/tools/financial_search    POST /v1/tools/transcript_search    POST /v1/tools/regulation_search
```

**Name the company, then narrow.** Pass `issuer` on every call and the answer
is scoped to that filer: fast and precise. Omit it and the call searches every
issuer at once — slower, relevance-ranked only, and the response carries a
`quality_caveat`. `scope: "issuer"` with **no** caveat is the only guarantee
you got a filtered answer, so read both fields.

And `query` is optional: omit it, pass an identifier plus `form_type` /
`fiscal_year` / `section`, and you get **fetch mode** — that filing's sections
in filing order, no ranking, `mode: "fetch"`, tens of milliseconds. If you
already know which document you want, don't rank it.

### TypeScript / Node

```bash
pnpm add @evidinvest/aether-sdk
```

```ts
import { AetherClient } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });

// search: the question in `query`, the company in `issuer`
const out = await aether.financialSearch({
  query: "supply-chain concentration risk",
  issuer: { ticker: "AAPL" },
  fiscal_year: 2025,
  limit: 5,
});
if (out.quality_caveat) console.warn(out.scope, out.quality_caveat);
for (const c of out.results) {
  const start = c.metadata?.retrieval?.body_offset ?? 0; // skip the EDGAR cover page
  console.log(c.citation, c.metadata?.source_url, c.text.slice(start, start + 200));
}

// fetch: no query — Apple's latest 10-K risk factors, in filing order
const risks = await aether.financialSearch({
  issuer: { ticker: "AAPL" },
  form_type: ["10-K"],
  section: "Item 1A",
  limit: 5,
});
console.log(risks.mode); // "fetch" — and no `confidence` on any hit
```

### Python

```bash
pip install evidinvest-aether-sdk
```

```python
from aether import AetherClient

with AetherClient(api_key="ak_...") as aether:
    out = aether.financial_search(
        query="supply-chain concentration risk",
        issuer={"ticker": "AAPL"},
        fiscal_year=2025,
        limit=5,
    )
    if out.quality_caveat:
        print(out.scope, out.quality_caveat)
    for c in out.results:
        start = c.body_offset or 0          # skip the EDGAR cover page
        print(c.citation, c.metadata.get("source_url"), c.text[start : start + 200])

    # fetch: no query — Apple's latest 10-K risk factors, in filing order
    risks = aether.financial_search(
        issuer={"ticker": "AAPL"}, form_type=["10-K"], section="Item 1A", limit=5
    )
    print(risks.mode)   # "fetch" — and `confidence` is None on every hit
```

### curl / any language

```bash
curl -sS https://api.aether.evidinvest.com/v1/tools/search \
  -H "authorization: Bearer $AETHER_API_KEY" \
  -H "content-type: application/json" \
  -d '{"query":"supply chain risk Taiwan","issuer":{"ticker":"TSM"},"limit":5}' | jq .
```

## Docs

- [`docs/search.md`](./docs/search.md) — REST API reference: all three tools, params, response shape.
- [`docs/regulation_search.md`](./docs/regulation_search.md) — EU financial-regulation search deep-dive (29 acts), filters, curl.
- [`docs/mcp.md`](./docs/mcp.md) — connect any MCP client (remote URL or stdio), env overrides.
- [`docs/chatgpt.md`](./docs/chatgpt.md) — ChatGPT Developer Mode walkthrough.
- [`docs/cursor.md`](./docs/cursor.md) — Cursor one-click install.

## Get an API key

https://aether.evidinvest.com/developer/keys — anonymous calls work but are
rate-limited; keys are free.

## What's in the corpus

- **SEC filings** — 10-K / 10-Q / 8-K, registration statements,
  prospectuses, press exhibits; ~10 years of S&P 500 and beyond.
- **Non-US registries** — Sweden (Bolagsverket), Japan (EDINET),
  Korea (DART) annual reports. Reach a non-US filer by name —
  `issuer: {company_name: "Sivers Semiconductors"}` — or scope a whole market
  with `jurisdiction: ["SE"|"JP"|"KR"]`.
- **Earnings calls** — speaker-attributed transcripts + furnished press
  exhibits, with point-in-time filters (`order: "earliest"` finds first
  mentions) and the issuer's own `fiscal_year` + `quarter`.
- **EU regulation** — MiFID II, MiCA, DORA, the AML package; article-level
  citations.

**3 months free.** Verify your email when you sign up and you're on the trial
tier automatically — up to 5,000 API calls/hour on Aether's search tools, free
for 3 months. No card required; it reverts to the free tier (100 calls/hour +
paid credits) when the trial ends.

## Contribute a client library

The TypeScript and Python clients are intentionally tiny — one bearer-token
fetch wrapper + typed shapes for the `/v1/tools/*` endpoints. Porting to Go,
Rust, Java, etc. is ~150 lines. Open a PR under `clients/<lang>/`. Whatever you
write, surface `scope`, `quality_caveat`, `mode` and each hit's `body_offset`:
a client that drops them leaves its users unable to tell a precise answer from
an approximate one. Response fixtures to test against live in
[`clients/fixtures/`](./clients/fixtures/).

## License

Apache-2.0 — see [LICENSE](./LICENSE).
