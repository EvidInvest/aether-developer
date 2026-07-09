/**
 * @evidinvest/aether-sdk
 *
 * Thin typed HTTP client for the Aether REST API. The MCP wrapper in
 * `@evidinvest/aether-mcp` uses the same endpoints via stdio; use this
 * package directly when you want to call Aether from a plain Node app, a
 * worker, a Next.js route handler, etc.
 *
 * Endpoints (same tools the MCP server exposes):
 *   POST /v1/tools/financial_search   — SEC filings (10-K/10-Q/8-K, S-1…) + non-US registries
 *   POST /v1/tools/transcript_search  — earnings-call transcripts + press exhibits
 *   POST /v1/tools/regulation_search  — EU financial regulation (MiFID II, MiCA, DORA, AML)
 *
 * Auth is a bearer token — either a long-lived API key from
 * https://aether.evidinvest.com/developer/keys or an OAuth access token
 * from the device-code / authorization-code flow. The SDK doesn't manage
 * token lifecycle; pass a fresh token in. Anonymous calls work but hit a
 * low rate limit.
 */

export interface AetherClientOptions {
  /**
   * Bearer token. API key (`ak_…`) or OAuth access token. Required for
   * authenticated quota; anonymous calls hit a low rate limit.
   */
  apiKey?: string;
  /** Override the API base. Defaults to https://api.aether.evidinvest.com. */
  baseUrl?: string;
  /** Override fetch (e.g. node-fetch in older Node, MSW in tests). */
  fetch?: typeof fetch;
}

// ---------------------------------------------------------------------------
// financial_search
// ---------------------------------------------------------------------------

export interface FinancialSearchInput {
  /** Natural-language search query. */
  query: string;
  /**
   * public_equity = single-company filing search; supply_chain =
   * cross-company supplier/customer relationship evidence; auto (default) =
   * detect from the query.
   */
  domain?: "public_equity" | "supply_chain" | "auto";
  /** Max results (server caps at 50, default 10). */
  limit?: number;
  /** Optional metadata fields to project into each hit. */
  fields?: string[];
  /** Retrieval profile; default is the production winner. */
  profile?: "bm25" | "hybrid" | "hybrid_rerank" | "hybrid_rerank_tickerprior";
  /**
   * "section" (default) returns the full SEC section the match belongs to;
   * "chunk" returns only the matching ~500-token window; "both" returns both.
   */
  return_format?: "section" | "chunk" | "both";
  /**
   * Scope to non-US issuer jurisdictions (ISO-3166 alpha-2): ["SE"] Sweden /
   * Bolagsverket, ["JP"] Japan / EDINET, ["KR"] Korea / DART. Omit to cover
   * US SEC filings (the default).
   */
  jurisdiction?: string[];
}

/** One ready-to-cite evidence payload. */
export interface AetherChunk {
  id: string;
  /** Exact section/chunk text from the primary source. */
  text: string;
  /** e.g. "sec/10-K/0000320193-25-000079". */
  source: string;
  /** e.g. "AAPL 10-K 2025-10-31 (Item 1A)". */
  citation?: string;
  /** Filing/call date, ISO YYYY-MM-DD. */
  as_of_date?: string;
  /** 0–1 retrieval confidence. */
  confidence?: number;
  /**
   * cik, ticker, company_name, form_type, section, accession_number,
   * source_url (sec.gov link), period_of_report, … (varies by tool).
   */
  metadata?: Record<string, unknown>;
}

export interface FinancialSearchOutput {
  query: string;
  domain: "public_equity" | "supply_chain" | "auto";
  results: AetherChunk[];
  total: number;
  source: string;
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// transcript_search
// ---------------------------------------------------------------------------

export interface TranscriptSearchInput {
  query: string;
  /** Uppercase symbol, e.g. "AAPL". */
  ticker?: string;
  /** e.g. 4 = last year of calls. */
  lookback_quarters?: number;
  /** "CEO" | "CFO" | "Analyst" | … */
  speaker_role?: string;
  limit?: number;
  profile?: "bm25" | "hybrid";
  /** Inclusive ISO date bounds on the call date (point-in-time retrieval). */
  date_from?: string;
  date_to?: string;
  /** "earliest"/"latest" sort chronologically; "relevance" (default) by score. */
  order?: "relevance" | "earliest" | "latest";
  /** Provenance: "press_release" | "furnished_transcript" | "asr_call". */
  source_type?: string;
}

export interface TranscriptSearchOutput {
  query: string;
  results: AetherChunk[];
  total: number;
  source: string;
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// regulation_search
// ---------------------------------------------------------------------------

export interface RegulationSearchInput {
  query: string;
  /** Filter to act(s) by CELEX number, e.g. "32024R1624". */
  celex?: string | string[];
  /** "regulation" | "directive" | "rts" | "its" | "decision". */
  doc_type?: string;
  /** Single article label (Formex labels can be "12a"). */
  article?: string;
  /** "paragraph" | "article_intro" | "recital" | "table" | "annex". */
  chunk_type?: string;
  /** AML topic tag(s): "cdd" | "edd" | "pep" | "str_reporting" | … */
  aml_topics?: string | string[];
  /** Prefer EUR-Lex consolidated text over the original OJ text. */
  prefer_consolidated?: boolean;
  limit?: number;
  profile?: "bm25" | "hybrid";
}

export interface RegulationSearchOutput {
  query: string;
  results: AetherChunk[];
  total: number;
  source: string;
  latency_ms: number;
}

// ---------------------------------------------------------------------------

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
    this.baseUrl = (opts.baseUrl ?? "https://api.aether.evidinvest.com").replace(
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

  /** Search SEC filings (+ SE/JP/KR registries). */
  async financialSearch(input: FinancialSearchInput): Promise<FinancialSearchOutput> {
    return this.request<FinancialSearchOutput>(
      "/v1/tools/financial_search",
      "POST",
      input,
    );
  }

  /** Search earnings-call transcripts and press exhibits. */
  async transcriptSearch(input: TranscriptSearchInput): Promise<TranscriptSearchOutput> {
    return this.request<TranscriptSearchOutput>(
      "/v1/tools/transcript_search",
      "POST",
      input,
    );
  }

  /** Search EU financial regulation (MiFID II, MiCA, DORA, AML package). */
  async regulationSearch(input: RegulationSearchInput): Promise<RegulationSearchOutput> {
    return this.request<RegulationSearchOutput>(
      "/v1/tools/regulation_search",
      "POST",
      input,
    );
  }

  /** @deprecated Alias of {@link financialSearch}; kept for 0.x callers. */
  async search(input: FinancialSearchInput): Promise<FinancialSearchOutput> {
    return this.financialSearch(input);
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
