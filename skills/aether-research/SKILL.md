---
name: aether-research
description: Cited equity research with Aether — routes filing/transcript/regulation questions to the right Aether tool, scopes every call to a named issuer, enforces citation discipline, and never lets an uncited figure into the answer. Use when researching public companies, SEC filings, earnings calls, or EU financial regulation.
---

# Aether equity research

You have access to Aether — a search engine built for agents over SEC
filings, earnings-call transcripts, and EU financial regulation. Every hit
returns the exact primary-source passage, an accession-numbered citation,
and a sec.gov / EUR-Lex URL. Your job: use it so **every factual claim in
your answer traces to a filed document**.

## Rule one: name the company, then narrow

Every company tool takes an `issuer` — `{ticker}`, `{cik}`, or
`{company_name}` for non-US filers with no US ticker. Put the **company** in
`issuer` and the **question** in `query`:

```json
{"query": "data center revenue growth drivers", "issuer": {"ticker": "NVDA"}, "fiscal_year": 2027}
```

Not `{"query": "NVDA data center revenue growth drivers"}`. Both appear to
work, which is what makes the second one dangerous: with no `issuer` the
engine guesses the filer from your query text, and generic words that happen
to be tickers point it at the wrong company. Measured: the ordinary word
"customers" resolves to Customers Bancorp, which then took two ranks of an
NVIDIA memo.

Then **read two fields off every response before you use it**:

- `scope` — `"issuer"` or `"cross_company"`.
- `quality_caveat` — present when the answer is not issuer-precise.

`scope: "issuer"` **with no caveat** is the only guarantee you got a filtered
answer. A caveat arriving *with* `scope: "issuer"` means the engine guessed the
company and names its guess — check it is the one you meant. A
`cross_company` answer spans every filer and is ranked by relevance only: say
so in your write-up rather than presenting it as a complete list.

Use `scope: "cross_company"` deliberately, for questions genuinely about many
issuers ("which filers name NVIDIA as a supplier"), and budget up to 15 s for
it. Then re-run scoped on any company worth a closer look.

## Rule two: if you know the document, don't rank it

`query` is optional. Omit it and you get **fetch mode**: pass an identifier
(`issuer.ticker` / `issuer.cik` / `issuer.company_name` / `accession_number`)
plus any of `form_type` / `fiscal_year` / `section` / `quarter`, and the filing
comes back in filing order — newest first, then document order, so Item 1
precedes Item 1A precedes Item 2. No ranking, tens of milliseconds,
`mode: "fetch"`, and **no `confidence` field** because nothing was scored.

```json
{"issuer": {"ticker": "NVDA"}, "form_type": ["10-Q"], "fiscal_year": 2027, "limit": 8}
```

Reach for it whenever the request is "this filing's sections" rather than "find
me the passage that answers X": the latest 10-K, a named accession, one
quarter's earnings call read in spoken order
(`{"issuer":{"ticker":"NVDA"},"fiscal_year":2027,"quarter":"Q2"}`). Searching
for a document you can name is how the current quarter's filing ends up
ranked 18th.

## Tool routing

| Question is about… | Tool | Key params |
|---|---|---|
| Anything, when you are not sure which corpus holds it | `search` (unified) | `issuer`, `fiscal_year`, `corpora`, `form_type` |
| Figures, risk factors, M&A/contract terms, segments, customers/suppliers in **filings** | `financial_search` | `issuer`, `fiscal_year`, `form_type`, `section`, `return_format`, `jurisdiction` |
| What **management said** — guidance, tone, Q&A, "when did they first mention X" | `transcript_search` | `issuer`, `fiscal_year`, `quarter`, `speaker_role`, `date_from/to`, `order` |
| **EU regulation** — MiFID II, MiCA, DORA, AML | `regulation_search` | `celex`, `article`, `doc_type`, `aml_topics` |
| **Who owns a stock / what a fund owns** | `holdings_by_security`, `holdings_by_manager` | Ownership never goes through search |

Routing rules:

- Prefer the unified `search` when the answer could be in more than one place —
  a filings-only search silently misses same-day 8-K earnings exhibits, which
  live in the transcript corpus.
- Cross-company supplier/customer questions ("who supplies TSMC?") →
  `scope: "cross_company"` with no issuer, and report the caveat. (`domain:
  "supply_chain"` is a deprecated synonym; retrieval no longer reads it.)
- Non-US issuers: Swedish (Bolagsverket), Japanese (EDINET), Korean (DART)
  companies are in-corpus. Reach them by name —
  `issuer: {"company_name": "Sivers Semiconductors"}` — or scope a whole market
  with `jurisdiction: ["SE"] / ["JP"] / ["KR"]`.
- `fiscal_year` is the **issuer's own** fiscal year, not a calendar window:
  NVIDIA FY2027 is the year ending Jan 2027, filed during calendar 2026. A year
  that matches nothing widens ±1 once and says so in `quality_caveat`.
- Onset questions ("when did X first come up?") → `transcript_search` with
  `order: "earliest"` and a `date_from`/`date_to` pair — a date pair, not a
  fiscal year, is the right tool there.
- Management-attribution questions → add `speaker_role: "CEO"` / `"CFO"`;
  quote verbatim, name the speaker and the call date.
- Filing text for LLM consumption: keep the default
  `return_format: "section"` (full section). Use `"chunk"` only when you
  need many small hits cheaply.
- Do not set `profile`. There is no reranker; the default is the production
  winner and the `hybrid_rerank*` values are aliases of it.

## Citation discipline (non-negotiable)

1. **No naked numbers.** Every figure, quote, or claim carries its citation:
   `(AAPL 10-K 2025-10-31, Item 1A — sec.gov link)`. Use the `citation` and
   `metadata.source_url` fields verbatim from the hit. `source` is an envelope
   tag, not a link.
2. **Quote, then interpret.** Lead with the filed passage (or a tight
   excerpt), then add your read. Keep the two visually separate so the
   reader can audit you.
3. **Crop excerpts from `body_offset`, never from character 0.** When a chunk
   opens with an EDGAR cover page, `body_offset` is where the real text starts —
   1,462 characters in, on a TSMC monthly-revenue 6-K. Quote from 0 and your
   evidence card reads "UNITED STATES SECURITIES AND EXCHANGE COMMISSION".
   Absent means the passage opens with its own body.
4. **Empty results = say so.** If Aether returns nothing, report "not found
   in the indexed filings" — never fill the gap from memory. Your memory of
   a 10-K is not a source; the retrieved text is. One exception worth a retry:
   a few transcript documents lack usable ticker metadata, so if a call you
   know exists comes back empty on a scoped search, try `cross_company` once
   before concluding it is gone.
5. **Date every claim.** Filings are point-in-time. State the filing date /
   call date next to the fact; flag when the latest filing is older than the
   question implies.
6. **`confidence` is a lead, not a threshold.** It is a relative score within
   one response, not a calibrated probability — treat a low-confidence hit as
   something to verify, but never filter on a fixed cut-off. It is absent
   entirely in fetch mode, which is correct: nothing was ranked.
7. **Fewer results than you asked for is normal.** Near-duplicates are
   suppressed rather than padded over, so a `limit: 10` call can legitimately
   return four distinct passages. Report what you got; do not retry for volume.

## Working pattern

1. Decompose the question into retrievable claims (a figure, a risk, a
   quote, a rule).
2. Decide per claim: do you know the document? **Fetch** it. Do you need to
   find the passage? **Search** it, with `issuer` set.
3. One targeted query per claim — specific beats broad ("data center revenue
   growth drivers" with `issuer: {ticker: "NVDA"}` over "NVIDIA financials").
4. Check `scope` and `quality_caveat` on each response before you quote from it.
5. If the first query misses, vary vocabulary once (filings say
   "concentration of credit risk", not "big customers"), then try the other
   tool (a number often appears in both the 10-Q and the call).
6. Synthesize only from retrieved text. Structure: claim → quoted evidence →
   citation → your interpretation.
7. End substantial answers with a **Sources** list: one line per document
   (form type, date, accession number, URL).

## Worked example

**User asks:** "Is Apple still dependent on a few suppliers?"

1. **Fetch** the section you already know you want — no ranking, no query:
   `financial_search` `{issuer: {ticker: "AAPL"}, form_type: ["10-K"], section: "Item 1A", limit: 5}`
   → `mode: "fetch"`, the newest 10-K's risk factors in document order.
2. Confirm `scope: "issuer"` and no `quality_caveat`, then read the returned
   section text from `body_offset`; extract the passage on single-source
   suppliers.
3. **Search** for management's latest framing, where you do need relevance:
   `transcript_search` `{query: "supply constraints suppliers", issuer: {ticker: "AAPL"}, fiscal_year: 2026, limit: 5}`
4. Answer: quoted 10-K passage + citation + sec.gov link, then the CEO/CFO
   quote with call date, then a two-sentence synthesis. Sources list at the
   bottom.

**If the question had been cross-company** — "which filers name Apple as a
customer?" — set `scope: "cross_company"`, expect a `quality_caveat`, and open
your answer by saying the list is relevance-ranked across all issuers rather
than a complete enumeration.
