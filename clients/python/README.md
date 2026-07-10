# aether (Python)

Python client for the [Aether](https://aether.evidinvest.com) REST API —
SEC filings, earnings-call transcripts, and EU financial regulation, every
hit a ready-to-cite payload (exact source text + accession-numbered citation
+ sec.gov URL). Mirrors the TypeScript SDK at [`../typescript`](../typescript).

## Install

```bash
pip install evidinvest-aether-sdk
```

## Use

```python
from aether import AetherClient

with AetherClient(api_key="ak_...") as aether:
    # SEC filings (10-K/10-Q/8-K, prospectuses) + SE/JP/KR registries
    out = aether.financial_search(query="Apple revenue concentration risk", limit=5)
    for c in out.results:
        print(c.citation, "->", c.metadata.get("source_url"))
        print(c.text[:200])

    # Earnings calls — speaker-attributed, point-in-time
    calls = aether.transcript_search(
        query="Blackwell demand",
        ticker="NVDA",
        order="earliest",  # find the FIRST mention
        limit=5,
    )

    # EU regulation — MiFID II, MiCA, DORA, AML package (article-level)
    reg = aether.regulation_search(
        query="stablecoin issuer own funds requirements",
        limit=5,
    )
```

Get an API key at https://aether.evidinvest.com/developer/keys (anonymous
calls work but are rate-limited). Full request/response reference:
[`docs/search.md`](../../docs/search.md).

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
