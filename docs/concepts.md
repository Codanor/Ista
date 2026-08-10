# Concepts

**Skill** — a directory with `skill.yaml` (metadata + capability intent) and `body.md` (the actual instructions), plus optional `attachments/`, `resources/`, `scripts/`. One skill lives in exactly one place; everything else (categories, links) is a reference on top.

**Capabilities** — a skill declares *what* it needs (`reads_files`, `writes_files`, `network`, `shell_exec`, `tools: [...]`, `spawn_subagents`, `approval`), never *how* a specific system should grant it. Each compiler's `supports()` reports, per capability, whether that system can **enforce** it, only **advise** about it, or has to **ignore** it entirely — and `ista sync` prints that honestly for every capability a skill actually uses.

**Compilers / systems** — `claude`, `gemini`, `codex`, `chatgpt` ship built in; anyone can register a `ista system add`-ed custom one. A system is just an object implementing `compile()`/`parse()`/`supports()`/`validate()` — see [Writing a custom compiler](./custom-compilers.md).

**Scopes** — `project` (`.ista/` found walking up from cwd), `user` (`~/.ista`, always available), `org` (a local mirror of a git remote, configured via `ista.config.yaml`). Resolution precedence is project → user → org (project wins on a name collision). Most commands default to project scope if you're in one, user scope otherwise.

**Categories** — `.ista/categories/<name>/index.yaml` is a plain list of skill references: same-scope entries by name, or `{ref: {scope, id}}` for cross-scope. A **link** is exactly this same primitive with `ref.scope` pointing elsewhere — no separate linking subsystem.

**Cross-scope lifecycle** — `link` references a skill from another scope without copying it; `fork` copies it with recorded lineage; `move` relocates it and links back from where it used to live; `update` propagates a fork's truth-of-origin forward (fast-forwards silently if the fork hasn't been hand-edited, otherwise shows a diff and asks). A backlink registry (`link-registry.yaml`) tracks who links/forks what, so `ista skill delete` can refuse (or offer to convert links to forks) instead of leaving dangling references.

## Bootstrap skills

`ista init` ships three first-party skills, written using Ista's own meta-schema — install all of them (the default, or `-y`) or pick a subset via the interactive wizard:

- **create-ista-skill** — walks through scaffolding a new skill end to end.
- **implement-system** — scaffolds and sanity-checks a new custom compiler.
- **create-ista-attachment** — adds a content fragment to an existing skill.

They're real skills (delete/edit them like any other) meant to be picked up by an agent operating inside the project once synced.
