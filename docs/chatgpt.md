# Aether in ChatGPT (Developer Mode)

ChatGPT can call Aether's MCP server directly — your ChatGPT searches SEC
filings and earnings calls and answers with accession-numbered citations and
sec.gov links, instead of inventing figures.

Requirements: a ChatGPT account with **Developer Mode** available
(Plus/Pro/Team; rollout varies), and a free Aether account (created during
the OAuth step).

## Setup (≈1 minute)

1. In ChatGPT, open **Settings → Apps & Connectors → Advanced settings** and
   turn on **Developer mode**.
2. Back in **Apps & Connectors**, choose **Create connector** (or *Add
   custom connector*).
3. Fill in:
   - **Name**: `Aether`
   - **MCP Server URL**: `https://api.aether.evidinvest.com/mcp`
   - **Authentication**: **OAuth**
4. Save. ChatGPT opens the Aether sign-in — create the free account or sign
   in, then **Approve**.
5. In a new chat, enable the Aether connector (plug icon / "Use connectors"),
   and ask a filing question.

## Try these first

> What does Apple's latest 10-K say about supply-chain concentration risk?
> Quote the passage and give me the sec.gov link.

> Compare Microsoft's and Google's most recent statements about AI capex on
> their earnings calls. Verbatim quotes with dates.

> When did NVIDIA management FIRST mention Blackwell on an earnings call?
> Search earliest-first.

> What are MiCA's requirements for stablecoin issuers? Cite the specific
> articles.

## What you get back

Every result ChatGPT receives is a pre-processed evidence payload:

- the **exact passage** from the filing / call transcript (not a summary),
- an accession-numbered **citation** (e.g. `AAPL 10-K 2025-10-31 (Item 1A)`),
- the **sec.gov source URL** so you can verify in one click,
- a confidence score.

If the answer isn't in a filing, the tool returns nothing rather than
letting the model guess — that's the point.

## Troubleshooting

- **"Developer mode" missing** — it lives under *Apps & Connectors →
  Advanced settings*; some workspace plans hide it behind admin settings.
- **OAuth window doesn't open** — pop-up blocked; retry from the connector's
  row (⋮ → Connect).
- **Tools not used in a chat** — make sure the connector is toggled on for
  that conversation (plug icon), and ask a question that clearly needs
  filings ("…according to their 10-K").
- **Rate limited** — anonymous/free quota is modest; sign in via OAuth (the
  connector setup does this) and it lifts. For heavier use, get an API key:
  https://aether.evidinvest.com/developer/keys
