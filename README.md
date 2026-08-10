<p align="center">
  <img src="LOGO.png" alt="Ista — a wizard's pointed hat" width="220">
</p>

<h1 align="center">Ista</h1>

<p align="center"><em>One skill definition. Every agent's actual permission model, told honestly.</em></p>

Ista compiles a single, system-agnostic skill definition into whatever native format and permission mechanism each AI coding agent actually has — and tells you honestly when a capability you asked for can't be enforced on the target.

Named after the *Istari* (Tolkien's order of wizards, e.g. Gandalf) — an instructor/guide archetype, fitting for a tool that distributes procedural knowledge to agents.

## Why

Claude Code, OpenAI Codex, Gemini CLI, ChatGPT Custom GPTs, and others have converged on a shared file format for skills (a `SKILL.md` with YAML frontmatter, per the open Agent Skills standard). That part isn't fragmented anymore.

What's still fragmented is the **permission layer** around skills:

| System | Permission model |
|---|---|
| Claude Code | Per-skill `allowed-tools` allowlist |
| Gemini CLI | Per-activation user consent + a tiered Policy Engine (never self-approves) |
| OpenAI Codex | No skill-scoped permissions at all — only session/sandbox-level config |
| ChatGPT Custom GPT | No local file or API target — capability intent is advisory at best |

Ista's job is to own the *capability-intent* layer above the file format and compile it down into each system's actual mechanism, **never claiming more enforcement than genuinely exists**. If a target can only advise about a capability, or can't express it at all, Ista says so at sync time instead of silently degrading.

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

[MIT](./LICENSE) © Revan1017
