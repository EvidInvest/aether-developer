/**
 * @evidinvest/aether-sdk
 *
 * Thin typed HTTP client for the Aether REST API. The MCP wrapper in
 * `@evidinvest/aether-mcp` uses it indirectly via stdio; use this package
 * directly when you want to call Aether from a plain Node app, a worker,
 * a Next.js route handler, etc.
 *
 * Auth is a bearer token — either a long-lived API key from
 * https://aether.evidinvest.com/developer/keys or an OAuth access token
 * from the device-code / authorization-code flow. The SDK doesn't manage
 * token lifecycle; pass a fresh token in.
 */

export interface AetherClientOptions {
  /**
   * Bearer token. API key (`ak_…`) or OAuth access token. Required for
   * authenticated endpoints; anonymous calls hit a low rate limit.
   */
  apiKey?: string;
  /** Override the API base. Defaults to https://aether.evidinvest.com. */
  baseUrl?: string;
  /** Override fetch (e.g. node-fetch in older Node, MSW in tests). */
  fetch?: typeof fetch;
}

export interface SearchOptions {
  query: string;
  /** Max hits to return (server caps at 50). */
  limit?: number;
  /** Restrict to specific schemas: filing_chunk, transcript_chunk, etc. */
  schemas?: string[];
  /** Filter by ticker symbols (uppercase, e.g. ["AAPL", "MSFT"]). */
  tickers?: string[];
}

export interface SearchHit {
  id: string;
  schema: string;
  score: number;
  title?: string;
  snippet?: string;
  source_url?: string;
  cik?: string;
  ticker?: string;
  section_title?: string;
  filed_at?: string;
  fields?: Record<string, unknown>;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  total_hits: number;
  latency_ms: number;
}

export class AetherError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message?: string,
  ) {
    super(message ?? `Aether API error ${status}: ${body.slice(0, 200)}`);
    this.name = "AetherError";
  }
}

export class AetherClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: AetherClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://aether.evidinvest.com").replace(
      /\/+$/,
      "",
    );
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error(
        "Global fetch not found — pass `fetch` via AetherClientOptions or run on Node >= 20.",
      );
    }
  }

  async search(input: SearchOptions): Promise<SearchResponse> {
    return this.request<SearchResponse>("/v1/search", "POST", input);
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new AetherError(res.status, await res.text());
    }
    return (await res.json()) as T;
  }
}
