# examples

Runnable demos of the Aether developer libraries.

| Example | Stack | What it does |
|---|---|---|
| [`node-search`](./node-search) | Node + `@evidinvest/aether-sdk` | Calls `/v1/search` with a tiny ranked-list printer. The minimal "is it working" smoke test. |

More to come — Claude Desktop config snippet, Next.js route example, Cursor
config, and a worker-based crawler that pipes hits into a downstream LLM.

## Run

```bash
pnpm install
AETHER_API_KEY=ak_... pnpm --filter node-search-example start
```
