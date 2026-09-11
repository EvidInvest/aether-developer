# Changelog — `evidinvest-aether-sdk`

## 0.3.0 — 2026-09-11

Aether re-cut its tool contract on 2026-09-11: every call now names its
subject, `query` became optional, and the cross-encoder was removed. This
release brings the client up to that contract and fixes a data-loss bug.

### Fixed

- **`_parse_output` was destroying `scope` and `quality_caveat`.** It rebuilt
  `SearchOutput` field by field from a fixed list, so a Python caller could not
  tell a caveated cross-company answer from a precise issuer-scoped one. Both
  are now on `SearchOutput`, along with `mode`, `ticker_filter` and
  `partial_errors` — and the untouched envelope is kept on `SearchOutput.raw`,
  so a field this dataclass does not name is no longer lost.
- Per hit, `Chunk` gained `body_offset` and `diagnostics` (lifted from
  `metadata.retrieval` when the tool nests them there), plus `corpus`,
  `corpus_label`, `source_url`, `anchor_id`, `context_token` and `raw`.
  Transcript segments keyed `segment_id` now parse into `Chunk.id` instead of
  an empty string.

### Breaking

- **`search()` is now the unified `/v1/tools/search` tool**, not an alias of
  `financial_search`. It searches SEC filings, Japan/EDINET, Korea/DART, EU
  regulation and earnings calls at once and returns corpus-tagged hits. The old
  alias is `financial_search_legacy()`, deprecated, for one release.

### Added

- `issuer` (`{"ticker"|"cik"|"company_name"}`), `fiscal_year` (`int` or
  `list[int]`) and `scope` on `search`, `financial_search` and
  `transcript_search`. **Pass `issuer` on every call** — `scope == "issuer"`
  with no `quality_caveat` is the only guarantee you got a filtered answer.
- `query` is optional everywhere — omit it for **fetch mode** (an identifier is
  then required). Fetch returns a filing's sections in filing order with no
  ranking, `mode == "fetch"`, and no `confidence` on any hit.
- Filing filters on `financial_search`: `accession_number`, `cik`, `form_type`,
  `section`, `exclude_form_type`, `prefer_recent`. `quarter` on
  `transcript_search`. All of `form_type` / `accession_number` / `section` /
  `quarter` / `return_format` / `corpora` on the unified `search`.
- `Issuer` and `FiscalYear` type aliases; a `transport` argument on
  `AetherClient` so tests can serve responses without a network.

### Changed

- `fiscal_year` is the **issuer's** fiscal year, not a calendar filed-date
  window — NVIDIA FY2027 ends Jan 2027 and is filed during calendar 2026.
- `confidence` is derived from the engine's fused score. Its numbers are not
  comparable to pre-2026-09-11 values; re-baseline anything that stored or
  thresholded one. It is a relative score, not a threshold, and it is absent in
  fetch mode.
- `profile` no longer advertises the `hybrid_rerank*` values as real profiles —
  they are aliases of `hybrid` for one release. Send nothing.
- `domain` is documented as a deprecated passthrough retrieval never reads.
- Results can come back **shorter than `limit`**. Not an error.

### Tests

`python3 -m unittest discover -s clients/python/tests` — 20 tests over fixtures
captured live on 2026-09-11 (`clients/fixtures/`), shared with the TS suite.

## 0.2.0

- First PyPI release under `evidinvest-aether-sdk`.
