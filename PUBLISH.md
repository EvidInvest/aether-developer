# Publishing Aether MCP 0.3.2

Metadata is already bumped to 0.3.2 (agent-native description) in
`mcp/package.json`, `mcp/server.json`, `mcp/claude-plugin.json`. Two manual
steps remain because both need interactive auth:

## 1. npm publish (needs your 2FA OTP — npm is in auth-and-writes mode)

```bash
cd /home/zee/project/EBD-Sweden/aether-developer/mcp
npm publish --access public --otp=<6-digit-code-from-authenticator>
```

(Or run `node --experimental-strip-types scripts/update-marketplaces.ts --publish`
from the repo root and paste the OTP when prompted.)

Verify: `npm view @evidinvest/aether-mcp version` → should show `0.3.2`.

## 2. Official MCP registry (needs GitHub auth via mcp-publisher)

The registry validates the npm version exists, so do step 1 first.

```bash
# install once
brew install mcp-publisher   # or: go install github.com/modelcontextprotocol/registry/cmd/mcp-publisher@latest
cd /home/zee/project/EBD-Sweden/aether-developer/mcp
mcp-publisher login github         # opens device-code flow
mcp-publisher publish              # reads server.json
```

Verify: `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=aether" | grep version`
→ should show `0.3.2` and the new agent-native description.

## Already done (no action)
- Smithery auto-reads from GitHub (server.json pushed).
- PulseMCP / Glama auto-ingest from the official registry weekly (updates after step 2).
- Live MCP server (aether.evidinvest.com/mcp) already serves the new tool
  descriptions + server instructions (deployed 2026-06-12).
