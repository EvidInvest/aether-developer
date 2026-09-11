# aether (Python)

Python client for the [Aether](https://aether.evidinvest.com) REST API —
SEC filings, earnings-call transcripts, and EU financial regulation, every
hit a ready-to-cite payload (exact source text + accession-numbered citation
+ sec.gov URL). Mirrors the TypeScript SDK at [`../typescript`](../typescript).

## Install

```bash
pip install evidinvest-aether-sdk
```

## The rule: name the company, then narrow

Pass `issuer` on every call — `{"ticker": …}`, `{"cik": …}`, or
`{"company_name": …}` for non-US filers with no US ticker. Then read `scope`
and `quality_caveat` off the response: **`scope == "issuer"` with no caveat is
the only guarantee you got a filtered answer.** Omit the issuer and the call
searches every filer at once: slower, relevance-ranked only, and caveated.

Keep the company in `issuer` and the question in `query`. Putting the ticker in
the query text appears to work — the engine infers a filer — which is exactly
why it is risky: nothing errors when the guess is wrong.

## Use

```python
from aether import AetherClient

with AetherClient(api_key="ak_...") as aether:
    # Unified — filings, JP/KR, EU regulation and earnings calls at once
    out = aether.search(
        query="data center revenue",
        issuer={"ticker": "NVDA"},
        fiscal_year=2027,   # NVIDIA's OWN fiscal year: the year ending Jan 2027
        limit=10,
    )
    if out.quality_caveat:
        print(out.scope, out.quality_caveat)
    for hit in out.results:
        print(hit.corpus, hit.citation, hit.text[hit.body_offset or 0 :][:200])

    # SEC filings (10-K/10-Q/8-K, prospectuses) + SE/JP/KR registries
    filings = aether.financial_search(
        query="supply-chain concentration risk",
        issuer={"ticker": "AAPL"},
        limit=5,
    )
    for c in filings.results:
        start = c.body_offset or 0          # skip the EDGAR cover page
        print(c.citation, "->", c.metadata.get("source_url"))
        print(c.text[start : start + 200])

    # Earnings calls — speaker-attributed, point-in-time
    calls = aether.transcript_search(
        query="Blackwell demand",
        issuer={"ticker": "NVDA"},
        order="earliest",   # find the FIRST mention
        limit=5,
    )
    print(calls.results[0].raw["speaker_name"], calls.results[0].raw["call_date"])

    # EU regulation — anchor on the CELEX, this corpus's equivalent of an issuer
    reg = aether.regulation_search(
        query="stablecoin issuer own funds requirements",
        celex="32023R1114",   # MiCA
        limit=5,
    )
```

## Fetch mode — don't rank a document you can name

`query` is optional. Omit it, pass an identifier plus `form_type` /
`fiscal_year` / `section` / `accession_number`, and you get that filing's
sections in filing order with no ranking — `mode == "fetch"`, tens of
milliseconds, and `confidence is None` on every hit (nothing was scored).

```python
risks = aether.financial_search(
    issuer={"ticker": "AAPL"},
    form_type=["10-K"],
    section="Item 1A",   # case-insensitive substring of the label
    limit=5,
)
risks.mode   # "fetch"
risks.total  # matching CHUNKS, not returned rows — use it to page
```

Same on transcripts: `transcript_search(issuer={"ticker": "NVDA"},
fiscal_year=2027, quarter="Q2")` returns one call in spoken order.

## Reading a response

- **`scope` + `quality_caveat` are the contract.** `source`, `profile`,
  `domain` and everything under `metadata["retrieval"]` are diagnostics —
  report them, never branch on them.
- **Crop from `body_offset`.** Where a chunk opens with an EDGAR cover page,
  that is the offset in `text` where the body begins — 1,462 characters in on a
  TSMC monthly-revenue 6-K. `None` means the text opens with its own body.
- **`confidence` is a relative score, not a threshold.** Do not gate rendering
  on a fixed cut-off; it is `None` in fetch mode by design.
- **Fewer results than `limit` is normal** — near-duplicates are suppressed
  rather than padded over. Not an error.
- **Keep the default 60 s timeout** on any path that can go cross-company; the
  engine's own floor there is 15 s.
- **Nothing is silently dropped:** `SearchOutput.raw` and `Chunk.raw` hold the
  untouched JSON, so a field this client does not name yet is still reachable.

Get an API key at https://aether.evidinvest.com/developer/keys (anonymous
calls work but are rate-limited). Full request/response reference:
[`docs/search.md`](../../docs/search.md). Changes:
[`CHANGELOG.md`](./CHANGELOG.md).

## Develop

```bash
python3 -m unittest discover -s clients/python/tests   # fixtures, no network
```

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
