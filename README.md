<p align="center">
  <img src="LOGO.png" alt="Ista — a wizard's pointed hat" width="220">
</p>

<h1 align="center">Ista</h1>

<p align="center"><em>Write a skill once. Every agent gets it — natively, honestly.</em></p>

Ista is a shared skill library for AI agents and providers. Author the skill once, everyone gets it in their native format and permission mechanism. No need for shared-folder hacks or hand-copied files which quietly drift out of sync.

Named after the greatest mentor and secret guide **Gandalf**, member of the **Ista**ri.

## Why

We already have the `Open Agent Skills standard`, which is great — but skills still live in folder formations like `/.claude` where only a specific model can read them. Additionally, there's no real agreement on how to handle permissions.

| System | Permission model |
|---|---|
| Claude Code | Per-skill `allowed-tools` allowlist |
| Gemini CLI | Per-activation user consent + a tiered Policy Engine (never self-approves) |
| OpenAI Codex | No skill-scoped permissions at all — only session/sandbox-level config |
| ChatGPT Custom GPT | No local file or API target — capability intent is advisory at best |

This is where **Ista** comes into play. Ista doesn't fight the native layouts of skill organization between different models, or enforce permissions where it's not supported. Instead, it provides one clean layer where you can register and organize skills, as well as grant them permissions.

Ista compiles registered skills down into the native provider layouts. It also owns the *capability-intent* layer above the file format and compiles it down into each system's actual mechanism, **never claiming more enforcement than genuinely exists**. If a target can only advise about a capability, or can't express it at all, Ista says so at sync time instead of silently degrading.

## Install

```bash
npm install -g @codanor/ista
```

Requires Node ≥ 22.6 — Ista runs its TypeScript source directly via Node's native type stripping, no build step.

To work on Ista itself, clone and link it locally instead:

```bash
git clone https://github.com/Codanor/Ista.git
cd Ista
npm install
npm link          # puts `ista` on your PATH, pointing at this checkout
```

## Quick start

```bash
ista init                        # interactive wizard: pick compilers + starter skills, creates .ista/ here
ista init -y                     # skip the wizard, install everything (also the default when not run in a terminal)
ista skill new code-review       # scaffolds .ista/skills/code-review/{skill.yaml,body.md}

# edit skill.yaml (turn on the capabilities it needs) and body.md (what it does)

ista skill validate              # checks skill.yaml against the schema
ista sync                        # compiles it to every system it's enabled for

ista skill attach code-review checklist   # scaffold attachments/checklist.md, register it on the skill
```

Attachments are content fragments — extra files a skill can pull in beyond `body.md`. `ista sync` appends each attached file's content onto the compiled body for every enabled system, so it shows up in the `.claude/`, `.gemini/`, `.codex/`, and `.chatgpt/` output alongside the main instructions.

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
