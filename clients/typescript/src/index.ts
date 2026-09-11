/**
 * @evidinvest/aether-sdk
 *
 * Thin typed HTTP client for the Aether REST API. The MCP wrapper in
 * `@evidinvest/aether-mcp` uses the same endpoints via stdio; use this
 * package directly when you want to call Aether from a plain Node app, a
 * worker, a Next.js route handler, etc.
 *
 * Endpoints (same tools the MCP server exposes):
 *   POST /v1/tools/search             — unified: filings + JP/KR + regulation + earnings calls
 *   POST /v1/tools/financial_search   — SEC filings (10-K/10-Q/8-K, S-1…) + non-US registries
 *   POST /v1/tools/transcript_search  — earnings-call transcripts + press exhibits
 *   POST /v1/tools/regulation_search  — EU financial regulation (MiFID II, MiCA, DORA, AML)
 *
 * The contract in one line: **name the company, then narrow.** Pass
 * `issuer: { ticker: "NVDA" }` (or `cik`, or `company_name` for non-US
 * filers) and the call is scoped, fast and precise. Omit it and the call runs
 * `scope: "cross_company"` — slower, relevance-ranked only, and the answer
 * carries a `quality_caveat`. `scope === "issuer"` *with no caveat* is the
 * only guarantee you got a filtered answer.
 *
 * Two modes: `query` is optional. Pass it to search (ranked, `mode:
 * "search"`). Omit it to fetch — pass an identifier plus any of `form_type` /
 * `fiscal_year` / `section` / `accession_number` and get that filing's
 * sections in filing order with no ranking (`mode: "fetch"`, and `confidence`
 * is absent on every hit).
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
// Shared contract types
// ---------------------------------------------------------------------------

/**
 * The company the question is about. Pass at least one field. `company_name`
 * is the route for non-US issuers, which have no US ticker or CIK.
 */
export interface Issuer {
  /** US ticker symbol, e.g. "NVDA". */
  ticker?: string;
  /** SEC CIK, any padding, e.g. "1045810". */
  cik?: string;
  /** Legal or common company name; required for non-US filers. */
  company_name?: string;
}

/**
 * The issuer's fiscal year **as the company labels it** — NVIDIA FY2027 is
 * the year ending Jan 2027, filed during calendar 2026. Not a calendar
 * filed-date window. A year that matches nothing widens ±1 once, with a
 * `quality_caveat` saying so.
 */
export type FiscalYear = number | number[];

/**
 * `issuer` (default): scoped to the named company — fast and precise.
 * `cross_company`: all issuers, relevance-ranked only, always caveated. Use
 * it deliberately, for questions genuinely about many filers ("who names
 * NVIDIA as a supplier").
 */
export type SearchScope = "issuer" | "cross_company";

/**
 * `search` = a `query` was given and hits are ranked by relevance.
 * `fetch` = no `query`; filters select rows and they come back in filing
 * order, unranked and without `confidence`.
 */
export type SearchMode = "search" | "fetch";

/** Engine diagnostics. Report them, don't branch on them. */
export interface AetherDiagnostics {
  /** Candidates retrieved before dedupe and diversity. */
  candidate_pool?: number;
  /** Near-duplicate / per-filing-cap suppressions across filings. */
  dedupe_dropped?: number;
  /** Cover pages, exhibit indexes and [Reserved] sections removed. */
  junk_dropped?: number;
  mode?: SearchMode;
  /** Which fiscal-year rule answered: without it you cannot tell a real absence from a wrong one. */
  fiscal_year_semantics?:
    | "dei_fiscal_year_focus"
    | "issuer_fy_end_month"
    | "calendar_filed_window"
    | "transcript_fiscal_year_column";
  /**
   * How the issuer was resolved. `inferred_from_query` means the filter was a
   * guess — the answer says `scope: "issuer"` but carries a caveat naming the
   * company that was guessed.
   */
  issuer_how?:
    | "explicit_cik"
    | "explicit_ticker"
    | "company_name"
    | "company_name_resolved"
    | "company_name_unresolved"
    | "inferred_from_query"
    | "none";
  /**
   * Character offset in `text` where the EDGAR cover page ends. Crop from
   * here, not from 0.
   */
  body_offset?: number;
  [key: string]: unknown;
}

/**
 * cik, ticker, company_name, form_type, section, accession_number,
 * source_url (sec.gov link), period_of_report, … plus a `retrieval`
 * sub-object of engine diagnostics.
 */
export interface AetherChunkMetadata {
  cik?: string;
  ticker?: string;
  company_name?: string;
  form_type?: string;
  section?: string;
  accession_number?: string;
  /** Click-through link to the primary source. */
  source_url?: string;
  period_of_report?: string;
  retrieval?: AetherDiagnostics;
  [key: string]: unknown;
}

/** One ready-to-cite evidence payload. */
export interface AetherChunk {
  id: string;
  /** Exact section/chunk text from the primary source. */
  text: string;
  /** e.g. "sec/10-K/0000320193-25-000079". An envelope tag, not a URL — the link is `metadata.source_url`. */
  source: string;
  /** e.g. "AAPL 10-K 2025-10-31 (Item 1A)". */
  citation?: string;
  /** Filing/call date, ISO YYYY-MM-DD. */
  as_of_date?: string;
  /**
   * 0–1 relevance. **Absent in fetch mode** — there is no relevance signal
   * and 0 would read as "certainly irrelevant". It is a relative score, not a
   * threshold: do not gate rendering on it.
   */
  confidence?: number;
  metadata?: AetherChunkMetadata;
}

// ---------------------------------------------------------------------------
// search (unified, auto-routing) — use this for most questions
// ---------------------------------------------------------------------------

export interface SearchInput {
  /**
   * Natural-language query. **Optional** — omit it (or pass an empty string)
   * to select fetch mode, which ranks nothing and returns rows in filing
   * order. Fetch requires an identifier: `issuer`, a single-element
   * `tickers`, or `accession_number`. Fetch fans out to sec/jp/kr/transcripts
   * only — EU regulation has no issuer.
   */
  query?: string;
  /** The company the question is about. Forwarded to every corpus. */
  issuer?: Issuer;
  fiscal_year?: FiscalYear;
  scope?: SearchScope;
  /** Legacy alias of `issuer`. One symbol reads as issuer.ticker; several is labelled cross_company. */
  tickers?: string[];
  /** Max hits (1–50, default 10). Answers can come back SHORTER than this — the diversity pass returns short rather than padding with copies. */
  limit?: number;
  /** Omit to search everything (recommended). A filing filter narrows an omitted fan-out to sec/jp/kr. */
  corpora?: Array<"sec" | "jp" | "kr" | "regulation" | "transcripts">;
  /** e.g. ["10-Q"]. Filing corpora only. */
  form_type?: string[];
  /** Exact SEC accession number; also counts as the fetch-mode identifier. */
  accession_number?: string;
  /** Case-insensitive substring of the stored label — "Item 1A" matches "Item 1A. Risk Factors". */
  section?: string | string[];
  /** "Q2" or ["Q1","Q2"]. Earnings-call corpus only. */
  quarter?: string | string[];
  /** Filing corpora only; the unified default is "chunk" to keep a five-corpus merge small. */
  return_format?: "section" | "chunk" | "both";
}

/** One hit from the unified tool — corpus-tagged and citation-complete. */
export interface SearchHit {
  id: string;
  /** Which corpus this hit came from. */
  corpus: "sec" | "jp" | "kr" | "regulation" | "transcripts";
  corpus_label?: string;
  /** Accession-numbered / article-level citation. */
  citation: string;
  text: string;
  source_url?: string;
  /** Absent in fetch mode. */
  confidence?: number;
  as_of_date?: string;
  /** Context-panel anchor (chunk/segment/doc id). */
  anchor_id: string;
  context_token?: string;
  /**
   * Filing corpora only, and only when the chunk opens with furniture: the
   * offset in `text` where the EDGAR cover page ends and the body begins.
   * Crop from here, not from 0 — on a TSMC monthly-revenue 6-K the first
   * 1,462 characters are the cover.
   */
  body_offset?: number;
  /** Filing corpora only: the engine fields a caller can act on. */
  diagnostics?: AetherDiagnostics;
  meta?: Record<string, unknown>;
}

export interface SearchOutput {
  query: string;
  mode?: SearchMode;
  results: SearchHit[];
  total: number;
  /** The worst case across the corpora that answered: any cross-company corpus makes the merged answer cross_company. */
  scope?: SearchScope;
  /** Present when any answering corpus was not issuer-precise. Read it before trusting the result. */
  quality_caveat?: string;
  latency_ms: number;
  partial_errors?: unknown[];
}

// ---------------------------------------------------------------------------
// financial_search
// ---------------------------------------------------------------------------

export interface FinancialSearchInput {
  /**
   * Natural-language query. **Optional** — omit it for fetch mode, which
   * needs an identifier (`issuer.ticker` / `issuer.cik` /
   * `issuer.company_name` / `cik` / `accession_number`) plus any of
   * `form_type` / `fiscal_year` / `section`.
   */
  query?: string;
  /** The company the filings are about. Pass it on every call. */
  issuer?: Issuer;
  fiscal_year?: FiscalYear;
  scope?: SearchScope;
  /**
   * @deprecated Pure passthrough — retrieval never reads it, and
   * `domain: "supply_chain"` means exactly `scope: "cross_company"`.
   */
  domain?: "public_equity" | "supply_chain" | "auto";
  /** Max results (server caps at 50, default 10). Fewer than `limit` is normal, not an error. */
  limit?: number;
  /** Optional metadata fields to project into each hit. */
  fields?: string[];
  /**
   * Retrieval profile; the default `hybrid` is the production winner. The
   * `hybrid_rerank*` values are accepted as aliases of `hybrid` for one
   * release — there is no reranker any more. Send nothing.
   */
  profile?: "bm25" | "hybrid" | "hybrid_rerank" | "hybrid_rerank_tickerprior";
  /**
   * "section" (default) returns the full SEC section the match belongs to;
   * "chunk" returns only the matching ~500-token window; "both" returns both.
   */
  return_format?: "section" | "chunk" | "both";
  /** Exact SEC accession number, e.g. "0001045810-26-000075". Also a fetch-mode identifier. */
  accession_number?: string;
  /** Explicit CIKs (max 20); an alternative fetch-mode identifier. */
  cik?: string[];
  /** e.g. ["10-Q"], ["20-F"]. */
  form_type?: string[];
  /** Case-insensitive substring of the stored label — "Item 1A" matches "Item 1A. Risk Factors". */
  section?: string | string[];
  exclude_form_type?: string[];
  /** Auto-enabled for latest/current/guidance queries; an explicit `fiscal_year` disables the recency prior outright. */
  prefer_recent?: boolean;
  /**
   * Scope to non-US issuer jurisdictions (ISO-3166 alpha-2): ["SE"] Sweden /
   * Bolagsverket, ["JP"] Japan / EDINET, ["KR"] Korea / DART. Omit to cover
   * US SEC filings (the default).
   */
  jurisdiction?: string[];
}

export interface FinancialSearchOutput {
  query: string;
  mode?: SearchMode;
  domain: "public_equity" | "supply_chain" | "auto";
  results: AetherChunk[];
  total: number;
  /** Envelope tag: `aether-pg-fetch` | `aether-pg-bm25` | `aether-pg-hybrid`. Diagnostic — do not branch on it. */
  source: string;
  /** Effective scope after issuer resolution. */
  scope?: SearchScope;
  /**
   * Present when the result is not issuer-precise. Four meanings, and two can
   * be present at once: explicit cross_company, no issuer at all, an issuer
   * *inferred* from the query text (arrives WITH `scope: "issuer"`), and a
   * widened fiscal year.
   */
  quality_caveat?: string;
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// transcript_search
// ---------------------------------------------------------------------------

export interface TranscriptSearchInput {
  /** Optional — omit for fetch mode, which needs `issuer.ticker`. */
  query?: string;
  /** This corpus is keyed on ticker, so `issuer.ticker` is the field that scopes it. */
  issuer?: Issuer;
  /** The segment's own labelled fiscal year, filtered exactly (NVDA FY2027 calls ran in calendar 2026). */
  fiscal_year?: FiscalYear;
  /** `cross_company` DROPS the ticker filter, so a caveated answer is never secretly a scoped one. */
  scope?: SearchScope;
  /** @deprecated Legacy alias of `issuer.ticker`. */
  ticker?: string;
  /** e.g. 4 = last year of calls. */
  lookback_quarters?: number;
  /** "CEO" | "CFO" | "Analyst" | … */
  speaker_role?: string;
  /** "Q2" or ["Q1","Q2"], exact and case-insensitive. With `issuer.ticker` + `fiscal_year` it names one call. */
  quarter?: string | string[];
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

/** One speaker turn. Note the id field is `segment_id`, not `id`. */
export interface TranscriptSegment {
  segment_id: string;
  ticker: string;
  /** The issuer's fiscal year, not the calendar year of the call. */
  fiscal_year: number;
  quarter: string;
  call_date: string;
  speaker_name: string;
  speaker_role: string;
  speaker_company?: string;
  segment_index?: number;
  segment_total?: number;
  /** Verbatim speaker-turn text. */
  text: string;
  source_url: string;
  source_type?: string;
  citation: string;
  /** 0 on every fetch result — there is no relevance signal. */
  confidence: number;
  retrieval?: AetherDiagnostics;
}

export interface TranscriptSearchOutput {
  query: string;
  mode?: SearchMode;
  ticker_filter?: string;
  results: TranscriptSegment[];
  total: number;
  source: string;
  scope?: SearchScope;
  quality_caveat?: string;
  latency_ms: number;
}

// ---------------------------------------------------------------------------
// regulation_search
// ---------------------------------------------------------------------------

export interface RegulationSearchInput {
  query: string;
  /**
   * This corpus's anchor — the equivalent of naming the issuer on a filing
   * search. CELEX number(s), e.g. "32024R1624". With none the call runs
   * across all 29 acts as `scope: "cross_company"` and is caveated.
   */
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
  scope?: SearchScope;
  quality_caveat?: string;
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

  /**
   * Unified search across every corpus at once — use this for most questions.
   *
   * Auto-routes and merges SEC filings, Japan/EDINET and Korea/DART annual
   * reports, EU regulation and earnings calls into one corpus-tagged result
   * set, so a filings-only search cannot silently miss a same-day 8-K
   * earnings exhibit. Pass `issuer`; it is forwarded to every corpus.
   * Ownership questions do not go through search at all.
   */
  async search(input: SearchInput): Promise<SearchOutput> {
    return this.request<SearchOutput>("/v1/tools/search", "POST", input);
  }

  /** Search (or fetch) SEC filings + SE/JP/KR registries. */
  async financialSearch(input: FinancialSearchInput): Promise<FinancialSearchOutput> {
    return this.request<FinancialSearchOutput>(
      "/v1/tools/financial_search",
      "POST",
      input,
    );
  }

  /** Search (or fetch) earnings-call transcripts and press exhibits. */
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

  /**
   * @deprecated Pre-1.0 `search()` was an alias of {@link financialSearch};
   * `search()` is now the unified tool. This is the old behaviour, kept for
   * one release — call {@link financialSearch} directly.
   */
  async financialSearchLegacy(
    input: FinancialSearchInput,
  ): Promise<FinancialSearchOutput> {
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
