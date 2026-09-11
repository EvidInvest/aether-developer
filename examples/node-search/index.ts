/**
 * Minimal example: three calls against the public Aether API, showing the
 * three things a client has to get right.
 *
 *   1. SEARCH, issuer-scoped — the company goes in `issuer`, the question in
 *      `query`. Check `scope` and `quality_caveat` before trusting the answer.
 *   2. FETCH — omit `query` entirely and name the filing. No ranking, tens of
 *      milliseconds, and no `confidence` on any hit.
 *   3. CROSS-COMPANY — deliberate, slower, and always caveated.
 *
 * Set AETHER_API_KEY to a key from
 * https://aether.evidinvest.com/developer/keys. The unauthenticated rate
 * limit is low but non-zero — handy for a smoke test.
 *
 *   pnpm install
 *   AETHER_API_KEY=ak_... pnpm --filter node-search-example start
 */
import { AetherClient, type AetherChunk } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });

/** Crop from body_offset, not from 0 — or you quote the EDGAR cover page. */
function excerpt(hit: AetherChunk, chars = 180): string {
  const start = hit.metadata?.retrieval?.body_offset ?? 0;
  return hit.text.slice(start, start + chars).replace(/\s+/g, " ").trim();
}

// ── 1. Search, scoped to one issuer ─────────────────────────────────────────
const scoped = await aether.financialSearch({
  query: "data center revenue growth drivers",
  issuer: { ticker: "NVDA" }, // the company, never in the query text
  fiscal_year: 2027, // NVIDIA's OWN fiscal year: ends Jan 2027
  limit: 5,
});

console.log(
  `\n[search] mode=${scoped.mode} scope=${scoped.scope} ` +
    `${scoped.results.length} of ${scoped.total} in ${scoped.latency_ms} ms`,
);
// scope "issuer" with NO caveat is the only guarantee you got a filtered answer.
if (scoped.quality_caveat) console.warn(`  caveat: ${scoped.quality_caveat}`);

for (const hit of scoped.results) {
  const conf = hit.confidence?.toFixed(3) ?? "—";
  console.log(`  [${conf}] ${hit.citation}`);
  console.log(`     ${excerpt(hit)}`);
  console.log(`     ${hit.metadata?.source_url}`); // `source` is a tag, not a link
}

// ── 2. Fetch — you already know which document you want, so don't rank it ────
const fetched = await aether.financialSearch({
  // no `query` at all → fetch mode. An identifier is required instead.
  issuer: { ticker: "NVDA" },
  form_type: ["10-Q"],
  fiscal_year: 2027,
  limit: 5,
});

console.log(
  `\n[fetch] mode=${fetched.mode} source=${fetched.source} ` +
    `${fetched.results.length} rows of ${fetched.total} matching chunks in ${fetched.latency_ms} ms`,
);
for (const hit of fetched.results) {
  // Filing-date desc, then document order — and confidence is undefined here.
  console.log(`  ${hit.as_of_date}  ${hit.metadata?.section}  ${hit.citation}`);
}

// ── 3. Cross-company — deliberate, and the caveat is part of the answer ──────
const wide = await aether.financialSearch({
  query: "HBM high bandwidth memory supply agreement",
  scope: "cross_company", // no issuer: every filer, relevance-ranked only
  limit: 5,
});

console.log(`\n[cross-company] scope=${wide.scope} in ${wide.latency_ms} ms`);
if (wide.quality_caveat) console.log(`  caveat: ${wide.quality_caveat}`);
for (const hit of wide.results) {
  console.log(`  ${hit.metadata?.ticker ?? "?"} — ${hit.citation}`);
}

// Answers can be SHORTER than `limit`: near-duplicates are suppressed rather
// than padded over. results.length < limit is not an error.
