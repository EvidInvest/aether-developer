# Changelog — `@evidinvest/aether-sdk`

## 1.0.0 — 2026-09-11

Aether re-cut its tool contract on 2026-09-11: every call now names its
subject, `query` became optional, and the cross-encoder was removed. This
release brings the SDK's types up to that contract.

**Why a major.** `search()` shipped in 0.3.0 as a published, exported method —
a deprecated alias of `financialSearch()`. It is now the **unified
`/v1/tools/search` tool**: a different endpoint with a different response
shape (`SearchOutput`, corpus-tagged `SearchHit[]`). Any caller on `search()`
would silently start getting a different payload, so SemVer says major. The
old behaviour is `financialSearchLegacy()`, deprecated, for one release.

### Breaking

- `search(input: SearchInput): Promise<SearchOutput>` now calls the unified
  tool — SEC filings, Japan/EDINET, Korea/DART, EU regulation and earnings
  calls merged into one corpus-tagged result set. Each hit carries `corpus`,
  `anchor_id`, and (on filing corpora) top-level `body_offset` and
  `diagnostics`.
- The former `search()` alias is now `financialSearchLegacy()`, `@deprecated`.
  Call `financialSearch()` directly.
- `TranscriptSearchOutput.results` is `TranscriptSegment[]`, not
  `AetherChunk[]`. The old typing was simply wrong: a transcript hit is keyed
  `segment_id`, not `id`, and carries `ticker` / `fiscal_year` / `quarter` /
  `call_date` / `speaker_name` at the top level. Runtime behaviour is
  unchanged; code that read `.id` off a transcript hit was already reading
  `undefined`.

### Added

- `Issuer`, `FiscalYear`, `SearchScope`, `SearchMode`, `AetherDiagnostics`,
  `AetherChunkMetadata`, `SearchInput`, `SearchHit`, `SearchOutput`,
  `TranscriptSegment`.
- `issuer` / `fiscal_year` / `scope` on `FinancialSearchInput`,
  `TranscriptSearchInput` and `SearchInput`. **Pass `issuer` on every call**:
  `scope: "issuer"` with no `quality_caveat` is the only guarantee you got a
  filtered answer.
- `query` is now optional on all three — omit it for **fetch mode** (an
  identifier is then required). Fetch returns a filing's sections in filing
  order with no ranking, `mode: "fetch"`, and no `confidence`.
- Filing filters on `FinancialSearchInput`: `accession_number`, `cik`,
  `form_type`, `section`, `exclude_form_type`, `prefer_recent`. On
  `TranscriptSearchInput`: `quarter`.
- Outputs gained `mode`, `scope` and `quality_caveat`;
  `AetherChunkMetadata.retrieval` types the per-hit diagnostics, including
  `body_offset` and `fiscal_year_semantics`.

### Changed

- `confidence` is documented as optional and **absent in fetch mode**. Its
  numbers are derived from the engine's fused score and are not comparable to
  pre-2026-09-11 values — re-baseline anything that stored or thresholded one.
  It is a relative score, not a threshold.
- `FinancialSearchInput.domain` is marked `@deprecated`: a pure passthrough
  retrieval never reads, and `domain: "supply_chain"` means exactly
  `scope: "cross_company"`.
- `profile`'s `hybrid_rerank*` values are documented as aliases of `hybrid`
  for one release — there is no reranker any more. Send nothing.
- Results can come back **shorter than `limit`**; the diversity pass returns
  short rather than padding with near-duplicates. Not an error.

### Tests

`pnpm --filter @evidinvest/aether-sdk test` — 15 tests over fixtures captured
live on 2026-09-11 (`clients/fixtures/`), shared with the Python suite.

## 0.3.0

- Marketplace and account endpoints; `search()` added as a deprecated alias of
  `financialSearch()`.
