/**
 * Minimal example: run a search against the public Aether API.
 *
 * Set AETHER_API_KEY to a key from
 * https://aether.evidinvest.com/developer/keys. The unauthenticated rate
 * limit is low but non-zero — handy for a smoke test.
 *
 *   pnpm install
 *   AETHER_API_KEY=ak_... pnpm --filter node-search-example start
 */
import { AetherClient } from "@evidinvest/aether-sdk";

const aether = new AetherClient({ apiKey: process.env.AETHER_API_KEY });

const { hits, latency_ms } = await aether.search({
  query: "supply chain concentration risk in Taiwan",
  limit: 5,
});

console.log(`${hits.length} hits in ${latency_ms} ms`);
for (const h of hits) {
  console.log(
    `[${h.score.toFixed(3)}] ${h.ticker ?? "?"} — ${h.section_title ?? h.title ?? "(no title)"}`,
  );
  if (h.snippet) console.log(`    ${h.snippet.slice(0, 200)}`);
}
