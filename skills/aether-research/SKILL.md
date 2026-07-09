---
name: aether-research
description: Cited equity research with Aether — routes filing/transcript/regulation questions to the right Aether tool, enforces citation discipline, and never lets an uncited figure into the answer. Use when researching public companies, SEC filings, earnings calls, or EU financial regulation.
---

# Aether equity research

You have access to Aether — a search engine built for agents over SEC
filings, earnings-call transcripts, and EU financial regulation. Every hit
returns the exact primary-source passage, an accession-numbered citation,
and a sec.gov / EUR-Lex URL. Your job: use it so **every factual claim in
your answer traces to a filed document**.

## Tool routing

| Question is about… | Tool | Key params |
|---|---|---|
| Figures, risk factors, M&A/contract terms, segments, customers/suppliers in **filings** | `financial_search` | `domain`, `return_format`, `jurisdiction` |
| What **management said** — guidance, tone, Q&A, "when did they first mention X" | `transcript_search` | `ticker`, `speaker_role`, `date_from/to`, `order` |
| **EU regulation** — MiFID II, MiCA, DORA, AML | `regulation_search` | `celex`, `article`, `doc_type`, `aml_topics` |

Routing rules:

- Cross-company supplier/customer questions ("who supplies TSMC?", "Apple's
  dependence on Foxconn") → `financial_search` with `domain: "supply_chain"`.
- Non-US issuers: Swedish (Bolagsverket), Japanese (EDINET), Korean (DART)
  companies are in-corpus. Naming the company usually suffices; to scope a
  whole market pass `jurisdiction: ["SE"]` / `["JP"]` / `["KR"]`.
- Onset questions ("when did X first come up?") → `transcript_search` with
  `order: "earliest"`; the semantic match still filters WHAT matches, the
  order only controls the sort.
- Management-attribution questions → add `speaker_role: "CEO"` / `"CFO"`;
  quote verbatim, name the speaker and the call date.
- Filing text for LLM consumption: keep the default
  `return_format: "section"` (full section). Use `"chunk"` only when you
  need many small hits cheaply.

## Citation discipline (non-negotiable)

1. **No naked numbers.** Every figure, quote, or claim carries its citation:
   `(AAPL 10-K 2025-10-31, Item 1A — sec.gov link)`. Use the `citation` and
   `metadata.source_url` fields verbatim from the hit.
2. **Quote, then interpret.** Lead with the filed passage (or a tight
   excerpt), then add your read. Keep the two visually separate so the
   reader can audit you.
3. **Empty results = say so.** If Aether returns nothing, report "not found
   in the indexed filings" — never fill the gap from memory. Your memory of
   a 10-K is not a source; the retrieved text is.
4. **Date every claim.** Filings are point-in-time. State the filing date /
   call date next to the fact; flag when the latest filing is older than the
   question implies.
5. **Confidence is a signal.** Hits carry a 0–1 `confidence` score; treat
   low-confidence hits as leads to verify, not evidence.

## Working pattern

1. Decompose the question into retrievable claims (a figure, a risk, a
   quote, a rule).
2. One targeted query per claim — specific beats broad ("NVDA data-center
   revenue Q3 fiscal 2026" over "NVIDIA financials").
3. If the first query misses, vary vocabulary once (filings say
   "concentration of credit risk", not "big customers"), then try the other
   tool (a number often appears in both the 10-Q and the call).
4. Synthesize only from retrieved text. Structure: claim → quoted evidence →
   citation → your interpretation.
5. End substantial answers with a **Sources** list: one line per document
   (form type, date, accession number, URL).

## Worked example

**User asks:** "Is Apple still dependent on a few suppliers?"

1. `financial_search` `{query: "Apple supplier concentration dependence single source components", domain: "supply_chain", limit: 5}`
2. Read the returned Item 1A section text; extract the passage on
   single-source suppliers.
3. `transcript_search` `{query: "supply constraints suppliers", ticker: "AAPL", lookback_quarters: 4, limit: 5}` for management's latest framing.
4. Answer: quoted 10-K passage + citation + sec.gov link, then the CEO/CFO
   quote with call date, then a two-sentence synthesis. Sources list at the
   bottom.
