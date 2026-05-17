# Claude Desktop config snippet

Drop this into your Claude Desktop `claude_desktop_config.json`:

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

Restart Claude Desktop. On first invocation it prints a device-code URL —
open it, sign in, approve. The token is cached at
`~/.config/aether/credentials.json` and refreshed automatically.

If you'd rather skip OAuth and use a long-lived API key:

```json
{
  "mcpServers": {
    "aether": {
      "command": "npx",
      "args": ["-y", "@evidinvest/aether-mcp"],
      "env": { "AETHER_API_KEY": "ak_..." }
    }
  }
}
```

Get keys at https://aether.evidinvest.com/developer/keys.
