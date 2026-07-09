# Aether skills

Drop-in [Agent Skills](https://docs.claude.com/en/docs/claude-code/skills)
that teach a Claude agent how to use Aether *well* — tool routing, citation
discipline, point-in-time retrieval — instead of leaving it to figure the
tools out mid-conversation.

Skills complement the MCP connection: **MCP gives the agent the tools;
the skill teaches it the craft.** Install both.

## Available skills

| Skill | What it does |
|---|---|
| [`aether-research`](./aether-research/SKILL.md) | Cited equity research: routes filing / transcript / regulation questions to the right Aether tool and enforces "no uncited figures" discipline. |

## Install

### Claude Code

Personal (all projects):

```bash
mkdir -p ~/.claude/skills
cp -r skills/aether-research ~/.claude/skills/
```

Project (shared with your team via git):

```bash
mkdir -p .claude/skills
cp -r skills/aether-research .claude/skills/
```

Claude Code auto-discovers the skill; it activates when a conversation turns
to equity research / SEC filings. Invoke it explicitly with
`/aether-research` if your client exposes skills as slash commands.

### Claude Desktop / claude.ai

Paste the body of `SKILL.md` (below the frontmatter) into a Project's
custom instructions, or attach it as project knowledge.

### Other agent frameworks

`SKILL.md` is plain markdown with YAML frontmatter (`name`, `description`).
Use it as a system-prompt fragment for any agent that has the Aether MCP
tools connected — the content is framework-agnostic.

## Prerequisite: connect the tools

The skill assumes the Aether MCP server is connected
(`https://api.aether.evidinvest.com/mcp` — see [`docs/mcp.md`](../docs/mcp.md))
or that your agent calls the REST API directly
([`docs/search.md`](../docs/search.md)).
