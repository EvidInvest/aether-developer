#!/usr/bin/env node
/**
 * Aether MCP — stdio MCP server with OAuth 2.0 device-code auth.
 *
 * Lets any MCP client that spawns a subprocess over stdio (Claude Desktop,
 * Cursor, Cline, Continue, …) use Aether's tools without speaking HTTP.
 *
 * Auth on first run:
 *   1. POST to /v1/oauth/device/code → get user_code + verification_uri
 *   2. Print the URL to stderr so the human user sees it in their terminal
 *   3. Poll /v1/oauth/device/token until the user approves in their browser
 *   4. Cache (access, refresh, expiry) in ~/.config/aether/credentials.json
 *
 * On subsequent runs:
 *   • Load cached tokens. If access > 30s from expiry, use it.
 *   • If access expired but refresh valid, rotate via /v1/oauth/token.
 *   • If refresh expired/revoked, fall back to device flow again.
 *
 * Aether splits its public surface across two hostnames:
 *
 *   • https://aether.evidinvest.com — MCP protocol + OAuth + account
 *     creation + marketing site. This is where OAuth device-code, token,
 *     and refresh endpoints live (`/v1/oauth/*`), along with the human
 *     verification page (`/v1/oauth/device`).
 *
 *   • https://api.aether.evidinvest.com — search-engine API only.
 *     `/v1/tools` (tool discovery) and `/v1/tools/<name>` (tool calls).
 *
 * AETHER_BASE_URL exists for back-compat: setting it overrides BOTH hosts.
 * For finer control set AETHER_API_BASE_URL and AETHER_MCP_BASE_URL.
 *
 * Environment:
 *   AETHER_API_BASE_URL   default https://api.aether.evidinvest.com
 *                          — host for tool discovery + tool calls
 *   AETHER_MCP_BASE_URL   default https://aether.evidinvest.com
 *                          — host for OAuth (device, token, refresh) + account
 *   AETHER_BASE_URL       deprecated: if set, overrides both of the above
 *   AETHER_CLIENT_ID      default 'aether-mcp-cli' (the trusted first-party client)
 *   AETHER_SCOPE          default 'aether.search aether.search.partners
 *                                  aether.partners.proxy aether.seller.read
 *                                  aether.account.read'
 *   AETHER_API_KEY        legacy: if set, skip OAuth and use this Bearer key
 *   AETHER_NO_AUTH        '1' = skip OAuth, call anonymously (rate-limited)
 *   AETHER_CREDENTIALS_PATH  override token cache file location
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

// AETHER_BASE_URL (back-compat) overrides both hosts when set. Otherwise the
// API host and MCP host can be overridden independently.
const LEGACY_BASE_URL = process.env.AETHER_BASE_URL?.replace(/\/$/, "") ?? "";
const API_BASE_URL = (
  LEGACY_BASE_URL ||
  process.env.AETHER_API_BASE_URL ||
  "https://api.aether.evidinvest.com"
).replace(/\/$/, "");
const MCP_BASE_URL = (
  LEGACY_BASE_URL ||
  process.env.AETHER_MCP_BASE_URL ||
  "https://aether.evidinvest.com"
).replace(/\/$/, "");
const CLIENT_ID = process.env.AETHER_CLIENT_ID ?? "aether-mcp-cli";
const SCOPE =
  process.env.AETHER_SCOPE ??
  "aether.search aether.search.partners aether.partners.proxy aether.seller.read aether.account.read";
const LEGACY_API_KEY = process.env.AETHER_API_KEY ?? "";
const NO_AUTH = process.env.AETHER_NO_AUTH === "1";
const VERSION = "0.3.0";

// ---------------------------------------------------------------------------
// Credentials file (~/.config/aether/credentials.json by default)
// ---------------------------------------------------------------------------
interface Credentials {
  access_token: string;
  refresh_token: string;
  /** Absolute Unix ms epoch */
  access_expires_at_ms: number;
  /** Absolute Unix ms epoch */
  refresh_expires_at_ms: number;
  scope: string;
  /** Aether base URL these tokens were issued against. */
  base_url: string;
}

function credsPath(): string {
  if (process.env.AETHER_CREDENTIALS_PATH) return process.env.AETHER_CREDENTIALS_PATH;
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "aether", "credentials.json");
}

function loadCreds(): Credentials | null {
  try {
    const p = credsPath();
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, "utf8");
    const c = JSON.parse(raw) as Credentials;
    // Tokens are scoped to the MCP host they were issued against. If the user
    // changed AETHER_MCP_BASE_URL (or AETHER_BASE_URL), force a new device flow
    // rather than presenting tokens to a different server.
    if (c.base_url !== MCP_BASE_URL) return null;
    return c;
  } catch {
    return null;
  }
}

function saveCreds(c: Credentials): void {
  const p = credsPath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(c, null, 2), "utf8");
  try {
    chmodSync(p, 0o600);
  } catch {
    // ignore chmod failure (e.g. Windows)
  }
}

function clearCreds(): void {
  try {
    const p = credsPath();
    if (existsSync(p)) writeFileSync(p, "", "utf8");
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// OAuth device-code flow
// ---------------------------------------------------------------------------
async function runDeviceFlow(): Promise<Credentials> {
  process.stderr.write(`[aether-mcp] no cached credentials — starting OAuth device flow\n`);

  // 1. /v1/oauth/device/code
  const r1 = await fetch(`${MCP_BASE_URL}/v1/oauth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: SCOPE }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r1.ok) {
    const txt = await r1.text().catch(() => "");
    throw new Error(`device/code failed: HTTP ${r1.status}: ${txt.slice(0, 200)}`);
  }
  const dc = (await r1.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };

  process.stderr.write(
    `\n` +
      `╔══════════════════════════════════════════════════════════════════╗\n` +
      `║  Aether — authorize this CLI                                     ║\n` +
      `╠══════════════════════════════════════════════════════════════════╣\n` +
      `║                                                                  ║\n` +
      `║  1. Open this URL in your browser:                               ║\n` +
      `║     ${dc.verification_uri.padEnd(60, " ")} ║\n` +
      `║                                                                  ║\n` +
      `║  2. Enter the code:  ${dc.user_code.padEnd(40, " ")}║\n` +
      `║                                                                  ║\n` +
      `║  Or one-click:                                                   ║\n` +
      `║  ${dc.verification_uri_complete.slice(0, 64).padEnd(64, " ")}║\n` +
      `║                                                                  ║\n` +
      `║  Expires in ${dc.expires_in}s.                                            ║\n` +
      `╚══════════════════════════════════════════════════════════════════╝\n\n`,
  );

  // 2. Poll /v1/oauth/device/token
  const startMs = Date.now();
  let interval = Math.max(1, dc.interval);
  while (Date.now() - startMs < dc.expires_in * 1000) {
    await new Promise((res) => setTimeout(res, interval * 1000));
    const r2 = await fetch(`${MCP_BASE_URL}/v1/oauth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: dc.device_code,
        client_id: CLIENT_ID,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await r2.json().catch(() => ({}))) as {
      error?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      scope?: string;
    };
    if (r2.ok && body.access_token && body.refresh_token) {
      const now = Date.now();
      const creds: Credentials = {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        access_expires_at_ms: now + (body.expires_in ?? 3600) * 1000,
        refresh_expires_at_ms: now + (body.refresh_expires_in ?? 2_592_000) * 1000,
        scope: body.scope ?? SCOPE,
        base_url: MCP_BASE_URL,
      };
      saveCreds(creds);
      process.stderr.write(`[aether-mcp] ✓ authorized; tokens cached at ${credsPath()}\n\n`);
      return creds;
    }
    if (body.error === "authorization_pending") continue;
    if (body.error === "slow_down") {
      interval = Math.min(interval + 5, 30);
      continue;
    }
    if (body.error === "access_denied") {
      throw new Error("authorization denied by user");
    }
    if (body.error === "expired_token") {
      throw new Error("device code expired before user authorized; restart and try again");
    }
    throw new Error(`device/token returned: ${JSON.stringify(body)}`);
  }
  throw new Error(`device code expired (${dc.expires_in}s elapsed without approval)`);
}

async function refreshTokens(c: Credentials): Promise<Credentials> {
  const r = await fetch(`${MCP_BASE_URL}/v1/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: c.refresh_token,
      client_id: CLIENT_ID,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    process.stderr.write(
      `[aether-mcp] refresh failed: ${body.error ?? r.status}; falling back to device flow\n`,
    );
    clearCreds();
    return runDeviceFlow();
  }
  const body = (await r.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    refresh_expires_in: number;
    scope: string;
  };
  const now = Date.now();
  const next: Credentials = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    access_expires_at_ms: now + body.expires_in * 1000,
    refresh_expires_at_ms: now + body.refresh_expires_in * 1000,
    scope: body.scope,
    base_url: MCP_BASE_URL,
  };
  saveCreds(next);
  return next;
}

/** Cached credentials, refreshed proactively when within 30s of expiry. */
let currentCreds: Credentials | null = null;

async function getAccessToken(): Promise<string | null> {
  if (LEGACY_API_KEY) return LEGACY_API_KEY;
  if (NO_AUTH) return null;
  if (!currentCreds) {
    currentCreds = loadCreds() ?? (await runDeviceFlow());
  }
  // 30 s buffer to avoid an in-flight call dying when the token tips over.
  if (currentCreds.access_expires_at_ms - Date.now() < 30_000) {
    if (currentCreds.refresh_expires_at_ms < Date.now()) {
      clearCreds();
      currentCreds = await runDeviceFlow();
    } else {
      currentCreds = await refreshTokens(currentCreds);
    }
  }
  return currentCreds.access_token;
}

// ---------------------------------------------------------------------------
// Tool discovery + invocation
// ---------------------------------------------------------------------------
interface ToolListResponse {
  tools: Tool[];
}

async function fetchTools(token: string | null): Promise<Tool[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE_URL}/v1/tools`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`tool discovery failed: HTTP ${res.status} from ${API_BASE_URL}/v1/tools`);
  }
  const data = (await res.json()) as ToolListResponse;
  if (!Array.isArray(data.tools)) {
    throw new Error("tool discovery response missing `tools` array");
  }
  return data.tools;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const token = await getAccessToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  const doFetch = async (): Promise<Response> =>
    fetch(`${API_BASE_URL}/v1/tools/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(60_000),
    });
  let res = await doFetch();
  // If the server says our token is no good (401), try one refresh + retry.
  if (res.status === 401 && currentCreds && !LEGACY_API_KEY && !NO_AUTH) {
    process.stderr.write(`[aether-mcp] token 401; attempting refresh\n`);
    currentCreds = await refreshTokens(currentCreds);
    headers["authorization"] = `Bearer ${currentCreds.access_token}`;
    res = await doFetch();
  }
  const ct = res.headers.get("content-type") ?? "";
  const body: unknown = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail =
      typeof body === "object" && body !== null ? JSON.stringify(body) : String(body);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return body;
}

async function main(): Promise<void> {
  // Health probe.
  const healthRes = await fetch(`${API_BASE_URL}/healthz`, {
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  if (!healthRes || !healthRes.ok) {
    process.stderr.write(
      `[aether-mcp] warning: ${API_BASE_URL}/healthz not OK at startup.\n`,
    );
  }

  // Get a token (triggers device flow on first run if needed).
  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch (err) {
    process.stderr.write(
      `[aether-mcp] auth failed: ${(err as Error).message}. Continuing anonymously — only free tools will work.\n`,
    );
  }

  let tools: Tool[];
  try {
    tools = await fetchTools(token);
    process.stderr.write(
      `[aether-mcp] ${VERSION}: discovered ${tools.length} tools from ${API_BASE_URL}\n`,
    );
  } catch (err) {
    process.stderr.write(
      `[aether-mcp] FATAL: ${(err as Error).message}. Set AETHER_API_BASE_URL to override (default ${API_BASE_URL}).\n`,
    );
    process.exit(2);
  }

  const server = new Server(
    { name: "aether", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (!tools.find((t) => t.name === name)) {
      return {
        isError: true,
        content: [{ type: "text", text: `unknown tool: ${name}` }],
      };
    }
    try {
      const result = await callTool(name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          { type: "text", text: `aether call failed: ${(err as Error).message}` },
        ],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[aether-mcp] stdio transport ready (api=${API_BASE_URL}, mcp=${MCP_BASE_URL}; auth=${
      LEGACY_API_KEY ? "legacy_api_key" : NO_AUTH ? "none" : "oauth_device"
    })\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[aether-mcp] fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
