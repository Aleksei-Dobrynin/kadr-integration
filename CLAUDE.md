# Kadr — CLAUDE.md

**Read [AGENTS.md](AGENTS.md) first** — the primary agent-agnostic entry point.
Follow its route into [Specs/README.md](Specs/README.md), then L1 → L2 → L3.
Project norms, architecture and contracts live in `Specs/`; keep this file
a thin pointer (operator's D-12 rule — no duplicated instructions).

Claude-Code-specific notes:

- Local session hooks (LLMWiki logging) live in `.claude/settings.local.json`
  — machine-specific, untracked (the whole `.claude/` dir is gitignored).
- The `kadr-*` agent skills for the EMBEDDED Claude Code panel are part of the
  app (`electron/skills/*.md`, synced to `~/.claude/skills/` at startup) and
  are unrelated to this file.
- Serena MCP project name: `kadr-integration`.
