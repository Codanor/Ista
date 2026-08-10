<p align="center">
  <img src="LOGO.png" alt="Ista — a wizard's pointed hat" width="220">
</p>

<h1 align="center">Ista</h1>

<p align="center"><em>Write a skill once. Every agent gets it — natively, honestly.</em></p>

Ista is a shared skill library for AI coding agents. Author the skill once, and Claude Code, Gemini CLI, Codex, and ChatGPT each get it in their own native format and permission mechanism — no shared-folder hack, no hand-copied files quietly drifting out of sync.

Named after the *Istari* (Tolkien's order of wizards, e.g. Gandalf) — an instructor/guide archetype, fitting for a tool that distributes procedural knowledge to agents.

## Why

Two problems, and they're different.

**Getting a skill in front of every agent.** Before Ista, you had two options: tell every model to ignore its own skill folder and read from one shared directory instead, or hand-copy the same skill into `.claude/skills/`, `.gemini/skills/`, `.codex/skills/`, and keep every copy in sync yourself. Neither holds up past a handful of skills. Write the skill once, run `ista sync`, and every agent finds it exactly where it already expects to look, in its own native format.

**What each agent actually lets it do.** Claude Code, OpenAI Codex, Gemini CLI, ChatGPT Custom GPTs, and others have converged on that shared file format (a `SKILL.md` with YAML frontmatter, per the open Agent Skills standard) — but the **permission layer** around it hasn't converged at all:

| System | Permission model |
|---|---|
| Claude Code | Per-skill `allowed-tools` allowlist |
| Gemini CLI | Per-activation user consent + a tiered Policy Engine (never self-approves) |
| OpenAI Codex | No skill-scoped permissions at all — only session/sandbox-level config |
| ChatGPT Custom GPT | No local file or API target — capability intent is advisory at best |

Ista owns the *capability-intent* layer above the file format and compiles it down into each system's actual mechanism, **never claiming more enforcement than genuinely exists**. If a target can only advise about a capability, or can't express it at all, Ista says so at sync time instead of silently degrading.

## Install

Not published to npm yet. Clone and link it locally:

```bash
git clone <this repo>
cd ista
npm install
npm link          # puts `ista` on your PATH, pointing at this checkout
```

Requires Node ≥ 22.6 — Ista runs its TypeScript source directly via Node's native type stripping, no build step.

## Quick start

```bash
ista init                        # interactive wizard: pick compilers + starter skills, creates .ista/ here
ista init -y                     # skip the wizard, install everything (also the default when not run in a terminal)
ista skill new code-review       # scaffolds .ista/skills/code-review/{skill.yaml,body.md}

# edit skill.yaml (turn on the capabilities it needs) and body.md (what it does)

ista skill validate              # checks skill.yaml against the schema
ista sync                        # compiles it to every system it's enabled for
```

`ista sync` writes `.claude/skills/code-review/SKILL.md` (and `.gemini/`, `.codex/`, `.chatgpt/` for whichever systems are enabled), so opening the project in Claude Code makes the skill available immediately.

## Documentation

- **[Concepts](docs/concepts.md)** — skills, capabilities, compilers, scopes, categories, cross-scope lifecycle, bootstrap skills
- **[CLI reference](docs/cli-reference.md)** — every command, flag by flag
- **[`skill.yaml` reference](docs/skill-yaml.md)** — full field-by-field schema, plus what each built-in system can actually enforce
- **[Writing a custom compiler](docs/custom-compilers.md)** — target a system Ista doesn't ship built-in support for
- **[Development](docs/development.md)** — project layout, running tests, current status
- **[Design spec](docs/ista-plan.md)** — the full handoff spec and rationale this was built from

## License

[MIT](./LICENSE) © Codanor
