# aether (Python)

Python client for the [Aether](https://aether.evidinvest.com) REST API.
Mirrors the TypeScript SDK at [`../typescript`](../typescript) so you get
the same shape in either language.

## Install

```bash
pip install aether-sdk
```

## Use

```python
from aether import AetherClient

with AetherClient(api_key="ak_...") as aether:
    result = aether.search(
        query="Apple revenue concentration risk",
        tickers=["AAPL"],
        limit=5,
    )
    for hit in result.hits:
        print(f"{hit.score:.3f} {hit.ticker} {hit.section_title}")
```

Get an API key at https://aether.evidinvest.com/developer/keys.

## License

Apache-2.0 — see [LICENSE](../../LICENSE).
