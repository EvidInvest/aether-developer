/**
 * Unit tests for @evidinvest/aether-sdk.
 *
 * No network: `fetch` is stubbed and every response body is a fixture from
 * `clients/fixtures`, captured live on 2026-09-11 — the same files the Python
 * suite reads, so the two clients cannot drift apart.
 *
 *   pnpm --filter @evidinvest/aether-sdk test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  AetherClient,
  AetherError,
  type FinancialSearchOutput,
  type SearchOutput,
  type TranscriptSearchOutput,
} from "./index.js";

const FIXTURES = new URL("../../fixtures/", import.meta.url);

function load(name: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`${name}.json`, FIXTURES)), "utf8"));
}

interface Captured {
  url: string;
  body: Record<string, unknown>;
}

function stub(payload: unknown, status = 200) {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>,
    });
    return {
      ok: status < 400,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as Response;
  }) as unknown as typeof fetch;
  return { calls, client: new AetherClient({ fetch: fetchImpl }) };
}

describe("scoped search", () => {
  it("keeps scope and reports no caveat — the only guarantee of a filtered answer", async () => {
    const { client } = stub(load("financial_search_scoped"));
    const out: FinancialSearchOutput = await client.financialSearch({
      query: "data center revenue growth drivers",
      issuer: { ticker: "NVDA" },
      fiscal_year: 2027,
      limit: 2,
    });
    assert.equal(out.scope, "issuer");
    assert.equal(out.quality_caveat, undefined);
    assert.equal(out.mode, "search");
    assert.equal(out.total, 415);
    assert.equal(out.source, "aether-pg-hybrid");
  });

  it("sends issuer and fiscal_year on the wire", async () => {
    const { calls, client } = stub(load("financial_search_scoped"));
    await client.financialSearch({
      query: "data center revenue growth drivers",
      issuer: { ticker: "NVDA" },
      fiscal_year: [2026, 2027],
    });
    assert.equal(calls[0]!.url, "https://api.aether.evidinvest.com/v1/tools/financial_search");
    assert.deepEqual(calls[0]!.body.issuer, { ticker: "NVDA" });
    assert.deepEqual(calls[0]!.body.fiscal_year, [2026, 2027]);
  });

  it("exposes per-hit retrieval diagnostics through the type", async () => {
    const { client } = stub(load("financial_search_scoped"));
    const out = await client.financialSearch({ query: "x", issuer: { cik: "1045810" } });
    const retrieval = out.results[0]!.metadata?.retrieval;
    assert.equal(retrieval?.fiscal_year_semantics, "dei_fiscal_year_focus");
    assert.equal(retrieval?.candidate_pool, 150);
    assert.equal(retrieval?.dedupe_dropped, 131);
    assert.equal(retrieval?.issuer_how, "explicit_ticker");
    assert.equal(typeof out.results[0]!.confidence, "number");
    assert.equal(out.results[0]!.metadata?.accession_number, "0001045810-26-000075");
  });
});

describe("cross-company search", () => {
  it("surfaces the caveat and the candidate cap", async () => {
    const { calls, client } = stub(load("financial_search_cross_company"));
    const out = await client.financialSearch({
      query: "HBM high bandwidth memory supply agreement",
      scope: "cross_company",
      limit: 2,
    });
    assert.equal(out.scope, "cross_company");
    assert.ok(out.quality_caveat?.includes("scope=cross_company"));
    assert.equal(out.total, 2000); // the candidate cap, not a corpus count
    assert.equal(calls[0]!.body.scope, "cross_company");
  });

  it("returns hits from issuers the caller never named", async () => {
    const { client } = stub(load("financial_search_cross_company"));
    const out = await client.financialSearch({ query: "HBM", scope: "cross_company" });
    assert.notEqual(out.results[0]!.metadata?.ticker, "NVDA");
  });
});

describe("fetch mode", () => {
  it("reports mode fetch and omits confidence on every hit", async () => {
    const { calls, client } = stub(load("financial_search_fetch"));
    const out = await client.financialSearch({
      issuer: { ticker: "NVDA" },
      form_type: ["10-Q"],
      fiscal_year: 2027,
      limit: 8,
    });
    assert.equal(out.mode, "fetch");
    assert.equal(out.scope, "issuer");
    assert.equal(out.source, "aether-pg-fetch");
    assert.equal(out.total, 128); // matching CHUNKS, not returned rows
    assert.ok(out.total > out.results.length);
    for (const hit of out.results) assert.equal(hit.confidence, undefined);
    assert.equal("query" in calls[0]!.body, false);
    assert.deepEqual(calls[0]!.body.form_type, ["10-Q"]);
  });

  it("returns filing order, not relevance order", async () => {
    const { client } = stub(load("financial_search_fetch"));
    const out = await client.financialSearch({ issuer: { ticker: "NVDA" }, form_type: ["10-Q"] });
    assert.equal(out.results[0]!.metadata?.section, "Item 1");
  });
});

describe("body_offset", () => {
  it("is where a rendered excerpt must start", async () => {
    const { client } = stub(load("financial_search_body_offset"));
    const out = await client.financialSearch({
      query: "TSMC monthly net revenue",
      issuer: { ticker: "TSM" },
    });
    const hit = out.results[0]!;
    assert.equal(hit.metadata?.retrieval?.body_offset, 1462);
    assert.ok(hit.text.startsWith("6-K")); // character 0 is the EDGAR cover
  });

  it("is absent when the chunk opens with its own body", async () => {
    const { client } = stub(load("financial_search_scoped"));
    const out = await client.financialSearch({ query: "x", issuer: { ticker: "NVDA" } });
    assert.equal(out.results[0]!.metadata?.retrieval?.body_offset, undefined);
  });
});

describe("unified search()", () => {
  it("calls /v1/tools/search, not financial_search", async () => {
    const { calls, client } = stub(load("search_unified"));
    await client.search({
      query: "data center revenue",
      issuer: { ticker: "NVDA" },
      corpora: ["sec"],
    });
    assert.equal(calls[0]!.url, "https://api.aether.evidinvest.com/v1/tools/search");
    assert.deepEqual(calls[0]!.body.corpora, ["sec"]);
  });

  it("returns corpus-tagged hits with top-level diagnostics", async () => {
    const { client } = stub(load("search_unified"));
    const out: SearchOutput = await client.search({
      query: "data center revenue",
      issuer: { ticker: "NVDA" },
    });
    assert.equal(out.scope, "issuer");
    assert.equal(out.quality_caveat, undefined);
    const hit = out.results[0]!;
    assert.equal(hit.corpus, "sec");
    assert.ok(hit.anchor_id.length > 0);
    assert.equal(hit.diagnostics?.mode, "search");
    assert.equal(hit.diagnostics?.issuer_how, "explicit_ticker");
  });

  it("forwards filing filters instead of dropping them", async () => {
    const { calls, client } = stub(load("search_unified"));
    await client.search({
      issuer: { ticker: "NVDA" },
      form_type: ["10-Q"],
      section: "Item 1A",
      limit: 2,
    });
    assert.deepEqual(calls[0]!.body.form_type, ["10-Q"]);
    assert.equal(calls[0]!.body.section, "Item 1A");
    assert.equal("query" in calls[0]!.body, false);
  });

  it("financialSearchLegacy still hits financial_search", async () => {
    const { calls, client } = stub(load("financial_search_scoped"));
    await client.financialSearchLegacy({ query: "x", issuer: { ticker: "NVDA" } });
    assert.equal(calls[0]!.url, "https://api.aether.evidinvest.com/v1/tools/financial_search");
  });
});

describe("transcript search", () => {
  it("names one call with issuer + fiscal_year + quarter and no query", async () => {
    const payload = {
      query: "",
      mode: "fetch",
      ticker_filter: "NVDA",
      results: [
        {
          segment_id: "seg-1",
          ticker: "NVDA",
          fiscal_year: 2027,
          quarter: "Q2",
          call_date: "2026-08-26",
          speaker_name: "Colette Kress",
          speaker_role: "CFO",
          text: "Data center revenue was …",
          source_url: "https://www.sec.gov/…",
          citation: "NVDA Q2 FY2027 earnings call (2026-08-26)",
          confidence: 0,
        },
      ],
      total: 1,
      source: "aether-pg-transcripts-fetch",
      scope: "issuer",
      latency_ms: 5,
    };
    const { calls, client } = stub(payload);
    const out: TranscriptSearchOutput = await client.transcriptSearch({
      issuer: { ticker: "NVDA" },
      fiscal_year: 2027,
      quarter: "Q2",
      limit: 5,
    });
    assert.equal(calls[0]!.url, "https://api.aether.evidinvest.com/v1/tools/transcript_search");
    assert.deepEqual(calls[0]!.body.issuer, { ticker: "NVDA" });
    assert.equal(calls[0]!.body.quarter, "Q2");
    assert.equal(out.mode, "fetch");
    assert.equal(out.ticker_filter, "NVDA");
    // Segments are keyed `segment_id`, and fiscal_year is the ISSUER's.
    assert.equal(out.results[0]!.segment_id, "seg-1");
    assert.equal(out.results[0]!.fiscal_year, 2027);
    assert.equal(out.results[0]!.confidence, 0);
  });
});

describe("errors", () => {
  it("raises AetherError carrying the server's message", async () => {
    const { client } = stub({ error: "invalid_input", details: "unsupported field: bogus" }, 400);
    await assert.rejects(
      () => client.search({ query: "x", issuer: { ticker: "NVDA" } }),
      (err: unknown) => {
        assert.ok(err instanceof AetherError);
        assert.equal(err.status, 400);
        assert.ok(err.body.includes("unsupported field"));
        return true;
      },
    );
  });
});
