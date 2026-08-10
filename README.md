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

## Attachments

A skill is `skill.yaml` + `body.md`. Attachments are extra `.md` fragments a skill can pull in beyond that single body file — for a checklist, a reference table, an example set, anything too long to keep inline but still part of the same skill.

```bash
ista skill attach code-review checklist
```

If `attachments/checklist.md` doesn't exist yet, this scaffolds a placeholder and registers it in the skill's `attachments: []` list; if it already exists on disk, it just registers it. Write the real content into that file, then `ista sync` — every enabled system's compiled output gets the attachment's content appended after `body.md`, in the same file (`.claude/skills/code-review/SKILL.md`, `.gemini/...`, etc.). There's no separate attachment file shipped alongside; it's folded into the one compiled artifact each system already expects.

The one rule: **an attachment inherits its parent skill's `capabilities` block in full and must never declare its own.** It's a content fragment, not an independent skill — it has no `skill.yaml` of its own, and it can't grant itself different permissions than its parent. If a fragment genuinely needs different capabilities, that's a sign it should be its own skill (`ista skill new`), not an attachment.

## Documentation

- **[Concepts](docs/concepts.md)** — skills, capabilities, compilers, scopes, categories, cross-scope lifecycle, bootstrap skills
- **[CLI reference](docs/cli-reference.md)** — every command, flag by flag
- **[`skill.yaml` reference](docs/skill-yaml.md)** — full field-by-field schema, plus what each built-in system can actually enforce
- **[Writing a custom compiler](docs/custom-compilers.md)** — target a system Ista doesn't ship built-in support for
- **[Development](docs/development.md)** — project layout, running tests, current status
- **[Design spec](docs/ista-plan.md)** — the full handoff spec and rationale this was built from

## License

[MIT](./LICENSE) © Codanor

## Commands

| Command | Description |
|---|---|
| `ista init [-y\|--yes]` | Create a project-scoped `.ista/` here (interactive wizard unless `-y` or non-TTY) |
| `ista skill new <name>` | Scaffold a new skill |
| `ista skill list [--category <name>]` | List skills in this scope |
| `ista skill validate [path]` | Validate `skill.yaml` against the meta-schema |
| `ista skill attach <skill> <attachment>` | Add/register a content fragment (attachment) on a skill |
| `ista skill delete <skill> [--force] [--convert-to-forks]` | Delete a skill (backlink-aware; refuses if other scopes link to it) |
| `ista sync [--force]` | Compile all skills to all enabled systems |
| `ista scan` | Detect drift: native-only, meta-only, dangling refs |
| `ista link <skill> <from> [--category <name>]` | Reference a skill from another scope without copying |
| `ista move <skill> <target-scope> [--category <name>]` | Relocate a skill to another scope, leaving a link back |
| `ista fork <skill> <from>` | Copy a skill from another scope as an independent skill with recorded lineage |
| `ista update <skill> <truth-location> <targets...> [--force]` | Propagate a truth skill's current content to its forks |
| `ista category add <skill> <category>` | File a same-scope skill into a category |
| `ista category list` | List categories in this scope |
| `ista category tree` | Show categories with their resolved skill entries |
| `ista system scaffold <id>` | Generate a stub compiler package implementing the compiler interface |
| `ista system add <id> --from <path\|npm:pkg>` | Register a compiler (local directory or npm package) |
| `ista system list` | List registered custom systems |
| `ista system remove <id>` | Unregister a custom system |
| `ista pull` | Clone/fast-forward the org-scope mirror from its git remote |
| `ista push [-m, --message <message>]` | Commit and publish local org-scope changes to its git remote |

See the [CLI reference](docs/cli-reference.md) for scope semantics and cross-scope command details.
