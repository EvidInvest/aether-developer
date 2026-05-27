/**
 * Aether MCP — hosted streamable-HTTP gateway (multi-tenant, stateless).
 *
 * The stdio entrypoint (index.ts) is single-tenant: it manages one user's OAuth
 * credentials locally and attaches them to every call. This gateway is the
 * opposite — it holds no credentials. Each request carries its own
 * `Authorization` header, which is forwarded verbatim to the Aether API. So an
 * invalid bearer fails closed (the API returns 401 and we surface it) rather
 * than silently downgrading to anonymous access; a request with no bearer is
 * passed through as anonymous (the API rate-limits it).
 *
 * It does no search itself — it translates MCP <-> the same `/v1/tools` API the
 * stdio server uses, which is backed by Vespa.
 *
 * Routes:
 *   POST /mcp      MCP Streamable HTTP (stateless: one transport per request)
 *   GET  /health   liveness probe (used by App Runner / ECS health checks)
 *
 * Env: PORT (default 3100); AETHER_API_BASE_URL (see config.ts).
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { API_BASE_URL, VERSION } from "./config.js";

const PORT = Number(process.env.PORT ?? 3100);
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** The caller's Authorization header, if any. Forwarded verbatim — never substituted. */
function callerAuth(req: IncomingMessage): string | undefined {
  const h = req.headers["authorization"];
  const value = Array.isArray(h) ? h[0] : h;
  return value && value.trim() ? value : undefined;
}

async function fetchTools(auth?: string): Promise<Tool[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (auth) headers["authorization"] = auth;
  const res = await fetch(`${API_BASE_URL}/v1/tools`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new Error(`tool discovery failed: HTTP ${res.status} from ${API_BASE_URL}/v1/tools`);
  }
  const data = (await res.json()) as { tools?: Tool[] };
  if (!Array.isArray(data.tools)) {
    throw new Error("tool discovery response missing `tools` array");
  }
  return data.tools;
}

async function forwardToolCall(
  name: string,
  args: Record<string, unknown>,
  auth?: string,
): Promise<unknown> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth) headers["authorization"] = auth;
  const res = await fetch(`${API_BASE_URL}/v1/tools/${encodeURIComponent(name)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(60_000),
  });
  const ct = res.headers.get("content-type") ?? "";
  const body: unknown = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail =
      typeof body === "object" && body !== null ? JSON.stringify(body) : String(body);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return body;
}

/** A fresh MCP Server bound to one caller's auth. Built per request (stateless). */
function buildServer(auth?: string): Server {
  const server = new Server({ name: "aether", version: VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await fetchTools(auth) }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await forwardToolCall(name, (args ?? {}) as Record<string, unknown>, auth);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `aether call failed: ${(err as Error).message}` }],
      };
    }
  });

  return server;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function jsonRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  if (res.headersSent) return;
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }));
}

const httpServer = createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];

  // Permissive CORS so browser-based MCP clients can connect; harmless for
  // server-side clients (Cowork, Claude Code).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "content-type, authorization, mcp-session-id, mcp-protocol-version",
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && (path === "/health" || path === "/healthz")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "aether-mcp", version: VERSION }));
    return;
  }

  if (path !== "/mcp") {
    jsonRpcError(res, 404, -32601, "Not found");
    return;
  }

  if (req.method !== "POST") {
    // Stateless server: no standalone SSE stream (GET) or session teardown (DELETE).
    jsonRpcError(res, 405, -32000, "Method Not Allowed (stateless server)");
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    jsonRpcError(res, 400, -32700, (err as Error).message);
    return;
  }

  const server = buildServer(callerAuth(req));
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true, // plain JSON responses — our tools are request/response, not streaming
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    process.stderr.write(`[aether-mcp-http] request error: ${(err as Error).message}\n`);
    jsonRpcError(res, 500, -32603, "Internal server error");
  }
});

httpServer.listen(PORT, () => {
  process.stderr.write(
    `[aether-mcp-http] ${VERSION} listening on :${PORT} (api=${API_BASE_URL}; stateless, per-request bearer)\n`,
  );
});
