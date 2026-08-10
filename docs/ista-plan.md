# Ista — Cross-Platform AI Skill Management CLI

## Handoff Spec for Implementation

This document is a complete technical specification of the Ista project, intended to be handed to an implementing agent (Claude Code) with no loss of design detail. It captures every decision made during design, the rationale behind each, and the compatibility constraints that must hold across the whole system.

---

## 1. Motivation & Positioning

AI coding agents (Claude Code, OpenAI Codex, Gemini CLI, Cursor, GitHub Copilot, and others) have converged on a shared file format for "skills" — the **Agent Skills open standard**, originally developed by Anthropic and released as an open specification on December 18, 2025. A skill is a folder containing a `SKILL.md` file (YAML frontmatter + markdown body) plus optional `scripts/`, `references/`/`resources/`, and `assets/`. This format is now supported natively by Claude Code, Claude.ai, OpenAI's ChatGPT and Codex CLI, Cursor, GitHub Copilot, Goose, Gemini CLI, Roo Code, Trae, Windsurf, Amp, and Factory, among others.

**Important implication for this project:** the base file format is *not* the fragmented part anymore. What remains genuinely fragmented, incompatible, and vendor-specific is the **permission/execution layer** wrapped around skills:

- **Claude Code**: per-skill tool allowlisting via an `allowed-tools` YAML frontmatter field. Only supported in the Claude Code CLI directly — the Agent SDK ignores this field entirely and requires permissions to be replicated separately via `allowedTools` + `permissionMode`. There are also open, currently-unresolved bugs where `allowed-tools` is parsed but not consistently enforced, and restriction is a separate concern from auto-approval (an allowlisted tool still triggers a permission prompt unless separately configured).
- **OpenAI Codex**: no per-skill permission mechanism at all. Permissions live one layer up, at the session/sandbox level — approval policy and sandbox mode (network access, writable roots) are configured via `config.toml` or `/permissions` profiles, independent of which skill is currently active.
- **Gemini CLI**: a third model — per-activation user consent (a confirmation prompt naming the skill and the directory it will gain access to) combined with a tiered Policy Engine. Extensions/skills can ship their own `policies/*.toml` rules, but these can never self-approve or enable "yolo" behavior — enforcement always defers to the user or admin tier.

Three incompatible permission philosophies: **skill-scoped allowlist** (Claude, partially broken), **session-scoped sandbox profile** (Codex, skill-agnostic), **per-activation consent + tiered policy** (Gemini, extension proposes, never self-grants).

**Ista's actual value proposition is not "unify the skill file format"** (already unified by the open standard) — **it is "own the capability-intent layer above the format, and compile it down into whatever native permission mechanism each system actually has, honestly reporting where that mechanism can't fully express the intent."**

### Naming

"Ista", from *Istari* (the order of wizards in Tolkien's legendarium, e.g. Gandalf) — an instructor/guide archetype, fitting for a tool that manages and distributes procedural knowledge to agents.

---

## 2. Core Design Constraints (must hold throughout implementation)

1. **Compiler-swappable architecture.** Every system (Claude, ChatGPT, Gemini, Codex, future/custom systems) is implemented as a plugin conforming to one fixed interface (§6). Nothing in core Ista logic may special-case a specific system by name outside of that plugin boundary.
2. **Never claim more safety/enforcement than actually exists.** Where a target system cannot structurally enforce a capability (e.g. Codex has no skill-scoped permissions), the compiler must emit an explicit warning, not silently degrade or imply protection that isn't there.
3. **The meta-schema is the single source of truth.** Native per-system files (`SKILL.md`, ChatGPT instructions, Gemini policy TOMLs, etc.) are *compiled artifacts*, not hand-edited. `ista scan`/`parse` exists specifically to reconcile drift when someone edits a native file directly.
4. **Skills only, not agent orchestration.** Ista does not manage, spawn, or orchestrate subagents. `spawn_subagents` is merely one capability-intent flag a skill can declare (see §4), on the same footing as `network` or `shell_exec`. Ista never becomes an agent runtime.
5. **Content vs. organization are decoupled.** A skill has exactly one physical storage location (flat store, §8). Categorization (§9) and cross-scope references (§10) are pure index/reference layers on top — never duplication of content.

---

## 3. Repository / Workspace Layout

Each scope (project, user, org) has an `.ista/` directory with the same internal shape:

```
.ista/
  ista.config.yaml         # scope config: enabled systems, org remote, etc.
  link-registry.yaml       # backlink registry — who references skills stored HERE (§10)
  skills/                  # flat store — one real directory per skill, source of truth
    code-review/
      skill.yaml
      body.md
      attachments/
        self-improve.md
      resources/
        lint-rules.json
      scripts/
        check_types.py
    commit-style/
      ...
  categories/               # pure organization layer, no skill content lives here (§9)
    dev-workflow/
      index.yaml             # list of skill ids, and/or cross-scope refs
    quality/
      index.yaml
```

Scope locations:

- **Project**: `<project-root>/.ista/` — created via `ista init`.
- **User**: `~/.ista/` — created on first `ista` invocation if absent.
- **Org**: a remote registry (git repo or URL) referenced from `ista.config.yaml`; treated as a read-mostly source projects/users can pull skills from.

Resolution order for skill lookup (lowest to highest precedence): **org → user → project**. A project-level skill of the same name/id shadows a user-level one, which shadows an org-level one.

---

## 4. The Meta-Schema (`skill.yaml`)

This is the canonical, fully-specified schema. Every field's purpose and compilation behavior is documented inline.

```yaml
# --- identity ---
id: cr-8f3a1c              # REQUIRED, stable, generated once at `ista skill new`,
                             # never changes even across renames/moves. All cross-scope
                             # references (links, forks, backlinks) key off this, not `name`.
name: code-review           # human-facing slug, freely renameable
description: Reviews code changes against team conventions before commit
version: 1.3.0               # semver; bumped manually or via `ista skill bump`

# --- activation ---
trigger:
  keywords: [review, pr, pull request, lint]
  always_on: false
  # Systems without real auto-triggering (e.g. a flat instructions field, like a
  # ChatGPT Custom GPT) fall back to: always include `description` in the
  # system-level context so the model can consider the skill relevant.

# --- scope / priority ---
scope: project               # user | project | org — informational; actual physical
                              # location is determined by which store the skill.yaml lives in
priority: 10                  # resolves ordering/conflicts when multiple skills match
                              # the same trigger context

# --- capability intent (system-agnostic — the "what", never the "how") ---
capabilities:
  reads_files: true
  writes_files: false
  network: false
  shell_exec: true
  tools: [git, python]          # named tool/binary access, system compilers map these
                                  # to their own native tool-naming conventions
  spawn_subagents: false          # e.g. Claude Code's Skill(...) nesting or subagent
                                  # tool use — Ista does not orchestrate this, it only
                                  # declares the intent so a compiler can request the
                                  # relevant native permission
  approval: required             # required | auto | inherit
                                  #   required = never request auto-approval, always
                                  #              prompt on the target system, regardless
                                  #              of what that system would otherwise allow
                                  #   auto     = request auto-approval where the target
                                  #              system supports it; falls back to
                                  #              required-equivalent behavior where it
                                  #              cannot be expressed
                                  #   inherit  = defer entirely to the host system's own
                                  #              default policy; Ista makes no request

# --- content ---
body: body.md                  # compiled into every target system's instruction body
attachments:                    # appended .md fragments, no separate capability
  - attachments/self-improve.md  # declarations — attachments inherit the parent
                                  # skill's `capabilities` block in full
resources:
  - resources/lint-rules.json
scripts:
  - scripts/check_types.py

# --- per-system targeting ---
systems:
  claude:
    enabled: true
    overrides:                   # escape hatch for native-only fields the meta-schema
      disable-model-invocation: false   # doesn't (and shouldn't) generalize
  chatgpt:
    enabled: true
    mode: custom_gpt              # custom_gpt | action | manual
  gemini:
    enabled: true
  codex:
    enabled: false                 # explicitly disabled: capability intent for this
                                    # skill can only be advisory on Codex (see §5),
                                    # author has chosen to opt out rather than accept
                                    # unenforced capabilities silently

# --- lineage (present only on forked skills, see §10) ---
forked_from:
  scope: global
  id: cr-8f3a1c
  version: 1.3.0                  # version of the source at fork time, used by
                                   # `ista update` to detect drift
```

### Schema validation

Ista ships a JSON Schema (derived 1:1 from the above, generated from a single TypeScript/Zod-equivalent definition so the schema and the runtime types can never drift from each other) and a `ista skill validate [path]` command that runs on every `skill new`, every `sync`, and in CI via `ista validate --all`.

---

## 5. Compiler Standard

### 5.1 Interface

Every system — first-party or custom — implements this exact interface. Nothing elsewhere in Ista may bypass it.

```ts
interface IstaCompiler {
  id: string;                 // "claude", "chatgpt", "gemini", "codex", or custom id
  displayName: string;

  // Compile one resolved skill (meta-schema fully resolved: attachments merged,
  // capabilities finalized) into this system's native format at targetPath.
  compile(skill: ResolvedSkill, ctx: CompileContext): CompileResult;

  // Reverse direction: scan a native-format location and return skills found there
  // that do not yet exist in the meta-schema store. Powers `ista scan`.
  parse(targetPath: string): DetectedSkill[];

  // Declare, per capability-intent field, whether this system can ENFORCE it,
  // only ADVISE about it (e.g. write it somewhere informational, no guarantee),
  // or must IGNORE it entirely. This is what makes constraint #2 in §2 possible.
  supports(): CapabilityReport;

  // Pre-flight validation specific to this system's constraints (e.g. Codex has
  // no skill-scoped enforcement at all, so certain capability combinations should
  // raise a validation issue rather than fail silently at compile time).
  validate(skill: ResolvedSkill): ValidationIssue[];
}

type CapabilityReport = {
  [K in keyof Capabilities]: "enforce" | "advise" | "ignore";
};
```

### 5.2 Compiler SDK (`@ista/compiler-sdk`)

Shared utilities so compiler authors never touch raw filesystem/serialization logic directly, and so behavior (idempotency, warning format) is consistent across every compiler:

- `writeFrontmatterFile(path, frontmatter, body)` — format-agnostic (YAML or TOML frontmatter) markdown file writer.
- `mirrorResources(skill, targetDir)` — copies `resources/`/`scripts/` into whatever subfolder convention the target system expects.
- `mapCapabilities(skill.capabilities, mappingTable)` — takes the capability-intent block plus a compiler-supplied lookup table (e.g. `shell_exec → allowed-tools: Bash`) and performs the boring field-by-field translation; the compiler author only needs to handle the parts that genuinely don't map.
- `warn(issue)` / `advise(issue)` — structured logging so `ista sync` produces one consistent "compiled with N warnings" summary across all compilers, rather than each compiler inventing its own log format.
- `diffAgainstExisting(targetPath, newContent)` — used for idempotent re-syncs, so re-running `ista sync` doesn't silently clobber a manual edit to a compiled file without telling the user.

### 5.3 First-party compilers to implement, in priority order

1. **Claude** — most fully specified target; implement first as the reference implementation of the interface.
2. **Gemini** — second, since its permission model (tiered policy + per-activation consent) is the most structurally different from Claude's, and will stress-test whether the `capabilities`/`CapabilityReport` abstraction actually holds up.
3. **Codex** — third; this compiler's `supports()` report will mark almost everything in `capabilities` as `"advise"` rather than `"enforce"`, since Codex has no skill-scoped permission mechanism. Its `compile()` output should include a generated `config.toml` profile snippet as a *suggestion* the user applies manually, plus a loud warning at compile time.
4. **ChatGPT / Custom GPT** — lowest priority; no real filesystem or API-driven sync target exists yet, so `compile()` output is copy-pasteable text rather than an automated push.

---

## 6. System Standard (custom/pluggable systems)

A "system" is a compiler package (§5) plus a manifest describing it:

```yaml
# ista-system.yaml
id: my-custom-tool
displayName: My Custom Tool
description: Compiles Ista skills into MyTool's proprietary format
defaultTargetPath: .mytool/skills/
compilerEntrypoint: ./compiler.js   # or a resolvable package name
```

CLI:

```
ista system add my-custom-tool --from ./my-compiler       # local directory
ista system add my-custom-tool --from npm:ista-compiler-foo  # published package
ista system list
ista system remove <id>
```

`ista system scaffold <id>` generates a stub compiler implementing the §5.1 interface with TODOs at every method, pre-wired to the SDK, so a new system implementation starts from a working skeleton rather than a blank file.

---

## 7. Scoping Model

Three tiers, resolved lowest → highest precedence: **org → user → project**.

- **`ista init`** run inside any directory creates a project-scoped `.ista/` there (§3), with its own `skills/`, `categories/`, `link-registry.yaml`, and `ista.config.yaml` (which systems are enabled *for this project specifically* — a project may enable a subset of the systems enabled globally).
- **User scope** (`~/.ista/`) is the default home for skills not tied to any one project.
- **Org scope** is a remote (git repo or URL) referenced in a project's or user's `ista.config.yaml`; treated as read-mostly — pulled from, not written to directly by ordinary skill edits.

A project can either **reference** a user/org-level skill (via `link`, §10 — always in sync with the source, no duplication) or **fork** it (§10 — independent copy with recorded lineage) if it needs project-specific edits. This choice is always explicit via the CLI command used; there is no implicit copy-on-write behavior.

---

## 8. Categorization (index-folder layer)

Skills live in exactly one place: the flat `skills/` store of whichever scope owns them (§3). Categorization is a **separate, purely referential layer**:

```
categories/
  dev-workflow/
    index.yaml
  quality/
    index.yaml
```

```yaml
# categories/dev-workflow/index.yaml
- code-review                              # same-scope skill, by id
- ref: {scope: global, id: st-4b21aa}       # cross-scope reference (see §10 — this is
                                             # exactly what `ista link` writes)
```

A skill can appear in any number of categories with zero duplication, since every entry is a reference, never a copy. `ista skill list --category quality` and `ista category tree` are simple index-file reads plus a resolve step.

**This mechanism is the same mechanism cross-scope linking uses** — a "link" (§10) is nothing more than a category-index entry whose `ref.scope` differs from the local scope. No separate linking subsystem is needed; `link`/`move`/`fork` are CLI ergonomics layered on top of this one primitive plus the backlink registry (§10).

---

## 9. Cross-Scope Skill Commands & Backlink Tracking

### 9.1 Identity prerequisite

All commands in this section operate on the stable `id` field (§4), never on `name`, since names can be renamed and could collide across scopes.

### 9.2 `ista link <skill> <from>`

Writes a `ref: {scope, id}` entry (§8) into the target scope's category index. **No content is copied.** At `ista sync` time, refs are resolved by reading the *current* `skill.yaml` at the source scope, so edits at the source propagate to every linked location automatically, with no separate update step required for links specifically (only forks need `update`, §9.5).

Also writes an entry into the source scope's `link-registry.yaml` (§9.6) recording that this reference now exists.

### 9.3 `ista move <skill> global`

Mechanically: **relocate the skill's physical directory** from the current scope's `skills/` store to the target scope's `skills/` store, **then perform exactly the `link` operation in reverse** — write a `ref` entry back at the original location's category index, so the skill remains discoverable from where it used to physically live. `move` therefore requires no new mechanism beyond §9.2 plus a directory relocation step.

### 9.4 `ista fork <skill> <from>`

Copies the skill's full content (not a reference) into the target scope as an independent skill with a **new** `id`, and records lineage on the new copy:

```yaml
id: cr-91b2d0                 # new, independent id
forked_from:
  scope: global
  id: cr-8f3a1c                # original id
  version: 1.3.0                # source version at fork time
```

Also writes an entry into the source scope's `link-registry.yaml` under `forked_by` (§9.6), distinct from `linked_by`.

### 9.5 `ista update <skill> <truth-location> <targets...>`

Propagates changes from the truth copy to one or more forks. **Not a blind overwrite by default:**

1. Compare each target's `body.md` / `resources/` / `capabilities` against the *current* content at `truth-location`.
2. If the fork's `forked_from.version` matches the truth's current version with no local modifications since the fork point → fast-forward automatically.
3. If the fork has diverged (local edits since fork point) → print a unified diff per changed file and prompt for confirmation, or open a merge flow.
4. `--force` skips confirmation entirely, for scripted/CI use.

### 9.6 Backlink Registry (`link-registry.yaml`)

Lives at the **source** scope's root (§3) — the location a skill is linked/forked *from*, not the location referencing it — because only the source can reliably know who depends on it if the registry is written to transactionally at link/fork time, rather than reconstructed later by scanning arbitrary project directories on disk (which would be unreliable and slow).

```yaml
# ~/.ista/link-registry.yaml
cr-8f3a1c:
  linked_by:
    - {scope: project, path: /home/user/projects/api-service}
    - {scope: project, path: /home/user/projects/web-app}
  forked_by:
    - {scope: project, path: /home/user/projects/legacy-tool, id: cr-91b2d0}
```

`ista link` and `ista fork` write to this registry **as part of the same atomic operation** that creates the reference/fork — never inferred after the fact.

**Deletion behavior** (`ista skill delete <skill>`):

1. Look up the skill's `id` in the local `link-registry.yaml`.
2. If `linked_by` is non-empty: **refuse by default**, list every affected project, and offer either:
   - `--force` — proceed anyway; dangling refs are left in place and will be flagged the next time `ista sync` or `ista scan` runs at the affected locations, or
   - an interactive **"convert these links to forks first"** path, which runs `ista fork` at each linked location (turning each into an independent, no-longer-dangling copy) before proceeding with the delete.
3. `forked_by` entries are non-blocking (forks are independent), but are surfaced as informational context — e.g. "3 projects have forked this skill; consider `ista update`-checking drift before making a breaking change here."

### 9.7 Relationship to `ista scan`

`ista scan` (detects skills present in a native system format but not yet in the meta-schema store, or vice versa) cross-references `link-registry.yaml` to distinguish an orphaned skill (no entries, safe to flag for cleanup) from an actively shared one (has `linked_by`/`forked_by` entries, flag differently or not at all).

---

## 10. Bootstrap Meta-Skills

Ista ships first-party skills, written in its own meta-schema, pre-loaded so an agent running inside the CLI's conversational surface can extend Ista using Ista itself:

- **`/create-ista-skill`** — walks through every `skill.yaml` field (§4) interactively, writes the directory structure (§3), runs `ista skill validate`.
- **`/implement-system`** — scaffolds a new compiler from the §6 template (`ista system scaffold`), points at the compiler SDK (§5.2), then compiles a sample skill through it and reports the resulting `CapabilityReport` (§5.1) back to the author for sanity-checking before they publish it.
- **`/create-ista-attachment`** — scaffolds a new attachment `.md` file, and explicitly reminds the author that attachments inherit the parent skill's `capabilities` block in full and must not declare their own (per §4's attachments note).

These double as living, testable documentation — more reliable than a static README, since they're directly executable against the real CLI.

---

## 11. Full CLI Command Reference

```
# workspace / scope
ista init                                       # create project-scoped .ista/ here

# systems
ista system add <id> --from <path|npm:pkg>      # register a compiler (custom or third-party)
ista system list
ista system remove <id>
ista system scaffold <id>                       # generate a stub compiler

# skills — lifecycle
ista skill new <name>                           # scaffold skill.yaml + body.md etc.
ista skill list [--category <name>]
ista skill validate [path]
ista skill delete <skill>                        # backlink-aware, see §9.6
ista skill bump <skill> [major|minor|patch]

# skills — cross-scope
ista move <skill> <target-scope>                 # relocate + leave a ref, §9.3
ista link <skill> <from>                          # reference without copying, §9.2
ista fork <skill> <from>                          # independent copy w/ lineage, §9.4
ista update <skill> <truth-location> <targets...> # propagate truth → forks, §9.5

# compilation
ista sync                                          # recompile all skills to all enabled systems
ista scan                                          # detect drift: native-only or meta-only skills, §9.7

# organization
ista category list
ista category tree
ista skill attach <skill> <attachment>

# git-backed versioning
ista push
ista pull
```

---

## 12. Phased Implementation Plan

**Phase 1 — Core + one compiler (proof of concept)**
- Meta-schema types + Zod/TS definitions + generated JSON Schema
- Flat skill store (`skills/`) read/write, `skill.yaml` validation
- Compiler interface (§5.1) + SDK (§5.2)
- Claude compiler (reference implementation)
- `ista init`, `ista skill new`, `ista skill validate`, `ista sync` (Claude only)

**Phase 2 — Multi-system + capability honesty**
- Gemini compiler (stress-tests the capability abstraction against a structurally different permission model)
- Codex compiler (stress-tests the "advise-only" path — no skill-scoped enforcement)
- `CapabilityReport` surfaced in `ista sync` output (per-skill, per-system warnings)
- `ista scan` (native → meta-schema reverse parse)

**Phase 3 — Scoping, categorization, cross-scope commands**
- Project/user/org resolution (§7)
- Category/index-folder layer (§8)
- `ista link`, `ista move`, `ista fork`, `ista update`, `link-registry.yaml` (§9)
- Backlink-aware `ista skill delete`

**Phase 4 — Extensibility + polish**
- `ista system add/scaffold` for custom third-party compilers (§6)
- Bootstrap meta-skills: `/create-ista-skill`, `/implement-system`, `/create-ista-attachment` (§10)
- ChatGPT compiler (manual/copy-paste target)
- Git-backed `ista push`/`ista pull`

**Phase 5 — future (explicitly out of scope for now)**
- Localhost web UI layer on top of the CLI
- Any form of subagent orchestration (explicitly rejected — see §2, constraint 4)

---

## 13. Explicit Non-Goals

- Ista does not orchestrate, spawn, or manage agents/subagents. `spawn_subagents` is a capability-intent flag only (§4).
- Ista does not reinvent the Agent Skills file format — it targets it as one of several compilation outputs, and treats it as the primary "cheap to compile" baseline given its existing cross-platform adoption.
- Native per-system files are compiled artifacts, never hand-authored as the source of truth (§2, constraint 3).
