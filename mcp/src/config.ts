/**
 * Shared runtime configuration for the Aether MCP server.
 *
 * Imported by both entrypoints — the stdio CLI (index.ts) and the hosted
 * streamable-HTTP gateway (http.ts) — so host/scope/auth resolution lives in
 * exactly one place.
 *
 * AETHER_BASE_URL (deprecated) overrides both hosts when set. Otherwise the API
 * host and MCP/OAuth host are overridden independently.
 */
const LEGACY_BASE_URL = process.env.AETHER_BASE_URL?.replace(/\/$/, "") ?? "";

/** Search-engine API: `/v1/tools` (discovery) and `/v1/tools/<name>` (calls). */
export const API_BASE_URL = (
  LEGACY_BASE_URL ||
  process.env.AETHER_API_BASE_URL ||
  "https://api.aether.evidinvest.com"
).replace(/\/$/, "");

/** OAuth (device, token, refresh) + account host. */
export const MCP_BASE_URL = (
  LEGACY_BASE_URL ||
  process.env.AETHER_MCP_BASE_URL ||
  "https://aether.evidinvest.com"
).replace(/\/$/, "");

export const CLIENT_ID = process.env.AETHER_CLIENT_ID ?? "aether-mcp-cli";
export const SCOPE =
  process.env.AETHER_SCOPE ??
  "aether.search aether.search.partners aether.partners.proxy aether.seller.read aether.account.read";
export const LEGACY_API_KEY = process.env.AETHER_API_KEY ?? "";
export const NO_AUTH = process.env.AETHER_NO_AUTH === "1";
export const VERSION = "0.3.1";
