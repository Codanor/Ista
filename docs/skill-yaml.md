# `skill.yaml` reference

```yaml
id: cr-8f3a1c              # stable, generated once, never changes
name: code-review           # human-facing slug (the directory name)
description: Reviews code changes against team conventions
version: 0.1.0

trigger:
  keywords: [review, pr]
  always_on: false

scope: project               # project | user | org (informational — physical location decides this)
priority: 0

capabilities:
  reads_files: false
  writes_files: false
  network: false
  shell_exec: false
  tools: []                  # named tools, only meaningful when shell_exec is true
  spawn_subagents: false
  approval: required          # required | auto | inherit

body: body.md
attachments: []               # .md fragments; inherit the parent's capabilities in full
resources: []
scripts: []

systems:
  claude:
    enabled: true
    overrides: {}              # escape hatch for native-only fields, e.g. disable-model-invocation
  gemini:
    enabled: true
  chatgpt:
    enabled: false

forked_from:                  # present only on forked skills
  scope: user
  id: cr-8f3a1c
  version: 1.0.0
  content_hash: ...            # used by `ista update` to detect local edits
```

`ista skill new` scaffolds the required fields for you; you rarely need to write this by hand except to flip capabilities or systems on/off.

## What each built-in system can actually enforce

| Capability | Claude | Gemini | Codex | ChatGPT |
|---|---|---|---|---|
| reads_files / writes_files / network / shell_exec / tools | enforce (`allowed-tools`) | enforce (Policy Engine) | advise (session-scoped only) | advise (no real target) |
| spawn_subagents | enforce | enforce | **ignore** | **ignore** |
| approval | **advise** (no per-skill field) | **advise** (always prompts) | advise | advise |

Ista never marks something `enforce` unless the target system structurally guarantees it — `ista sync` prints a warning line for every capability that falls short of that on a given system.
