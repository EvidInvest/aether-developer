# Publishing

Three packages ship from this repo. CI does **not** publish any of them; each
needs interactive auth, so they are manual steps.

| Package | Registry | This release |
|---|---|---|
| `@evidinvest/aether-sdk` | npm | **1.0.0** (was 0.3.0) |
| `evidinvest-aether-sdk` | PyPI | **0.3.0** (was 0.2.0) |
| `@evidinvest/aether-mcp` | npm + MCP registry | **0.3.3** (was 0.3.2) |

Before publishing anything, from the repo root:

```bash
pnpm install
pnpm --filter @evidinvest/aether-sdk test
pnpm --filter @evidinvest/aether-sdk typecheck
pnpm --filter @evidinvest/aether-mcp typecheck
python3 -m unittest discover -s clients/python/tests
```

## 1. `@evidinvest/aether-sdk` → npm (needs your 2FA OTP)

`1.0.0` is a **major**: `search()` was a published, exported method — a
deprecated alias of `financialSearch()` — and it is now the unified
`/v1/tools/search` tool, a different endpoint with a different response shape.
The old behaviour lives on as `financialSearchLegacy()`. See
[`clients/typescript/CHANGELOG.md`](./clients/typescript/CHANGELOG.md).

```bash
cd /home/zee/project/EBD-Sweden/aether-developer/clients/typescript
npm publish --access public --otp=<6-digit-code-from-authenticator>
```

`prepublishOnly` runs the build, so `dist/` does not need to exist first.

Verify: `npm view @evidinvest/aether-sdk version` → `1.0.0`.

## 2. `evidinvest-aether-sdk` → PyPI

Preferred path — **Trusted Publishing, no tokens**. Push the tag and
`.github/workflows/publish-pypi.yml` builds and uploads over OIDC:

```bash
cd /home/zee/project/EBD-Sweden/aether-developer
git tag python-v0.3.0
git push origin python-v0.3.0
```

(Or run the `publish-pypi` workflow from the Actions tab.) If it fails on
auth, check the pending-publisher entry at pypi.org → Publishing still names
the **`evidinvest-aether-sdk`** project — the distribution was renamed in
`1500af0` and the workflow comment still says `aether-sdk`.

Manual fallback, if you'd rather not tag (needs a PyPI API token in
`~/.pypirc` or `TWINE_PASSWORD`):

```bash
cd /home/zee/project/EBD-Sweden/aether-developer/clients/python
rm -rf dist && python3 -m build
python3 -m twine upload dist/evidinvest_aether_sdk-0.3.0*
```

Verify: `pip index versions evidinvest-aether-sdk` → `0.3.0`.

## 3. `@evidinvest/aether-mcp` → npm (needs your 2FA OTP)

Patch release: the wrapper itself is unchanged pass-through code. What ships is
the README note that tool definitions are fetched **once at startup** — a
running Claude Desktop / Cursor session keeps the old tool descriptions until
it is restarted — plus the reworked `claude-plugin.json` prompt templates and
descriptions that no longer advertise a reranker that has been removed.

```bash
cd /home/zee/project/EBD-Sweden/aether-developer/mcp
npm publish --access public --otp=<6-digit-code-from-authenticator>
```

(Or `node --experimental-strip-types scripts/update-marketplaces.ts --publish`
from the repo root and paste the OTP when prompted.)

Verify: `npm view @evidinvest/aether-mcp version` → `0.3.3`.

## 4. Official MCP registry (needs GitHub auth via mcp-publisher)

The registry validates that the npm version exists, so do step 3 first.

```bash
# install once
brew install mcp-publisher   # or: go install github.com/modelcontextprotocol/registry/cmd/mcp-publisher@latest
cd /home/zee/project/EBD-Sweden/aether-developer/mcp
mcp-publisher login github         # opens device-code flow
mcp-publisher publish              # reads server.json
```

Verify: `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=aether" | grep version`
→ `0.3.3`.

## After publishing

Restart any local MCP client (Claude Desktop, Cursor, Cline) before testing —
the stdio wrapper caches `/v1/tools` for the life of the process, and the
public catalog is edge-cached for 300 s on top of that.

## Already handled (no action)

- Smithery auto-reads from GitHub (`mcp/server.json` pushed).
- PulseMCP / Glama auto-ingest from the official registry weekly (updates
  after step 4).
- The live MCP server (aether.evidinvest.com/mcp) serves tool descriptions
  straight from Aether, so it is already on the new contract.
