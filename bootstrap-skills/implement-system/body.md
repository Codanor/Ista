# Implement a new Ista system

Build a compiler for a system Ista doesn't support natively yet (something other than Claude/Gemini/Codex/ChatGPT).

## 1. Understand the target system's actual permission model first

Before writing any code, ask the user (or research) how the target tool actually gates capabilities:

- Does it have a **skill-scoped** allowlist (like Claude's `allowed-tools`)?
- Does it only have **session/sandbox-scoped** config, independent of which skill is active (like Codex)?
- Does it require **per-activation user consent** it can never skip (like Gemini)?
- Or does it have **no local file or API target at all** (like ChatGPT), making the output copy-pasteable text at best?

This determines what `supports()` can honestly claim -- never mark a capability `"enforce"` unless the target system genuinely, structurally restricts it. Getting this wrong is worse than not building the compiler at all (see ista-plan.md §2, constraint 2).

## 2. Scaffold

Run `ista system scaffold <id>` (pick a short id for the system). This generates `./ista-compiler-<id>/` with `ista-system.yaml`, `package.json`, and a `compiler.js` stub with TODOs at every method.

## 3. Fill in `compiler.js`

- `compile(skill, ctx)` -- write the skill's compiled form somewhere under `ctx.projectRoot`. Reuse the pattern the built-in compilers use: check for a manual edit before overwriting (`ctx.force` controls whether to clobber it).
- `parse(targetPath)` -- scan for skills already in this system's native format that aren't in Ista's store yet. Can return `[]` for now; it only powers `ista scan`.
- `supports()` -- the honesty report from step 1. Every capability key needs `"enforce"`, `"advise"`, or `"ignore"`.
- `validate(skill)` -- pre-flight warnings specific to this system (e.g. "this combination has no real enforcement here").

## 4. Register and sanity-check

1. `ista system add <id> --from ./ista-compiler-<id>`
2. Pick (or create with `/create-ista-skill`) a sample skill with a few capabilities turned on, enable the new system for it in its `skill.yaml`, and run `ista sync`.
3. Show the user the compiled output *and* the `supports()` report that printed during sync. Ask them to confirm the enforce/advise/ignore split actually matches the target system's real behavior before they consider publishing the compiler package.
