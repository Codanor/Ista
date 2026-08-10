# Create an Ista skill

Walk the user through building a new Ista skill, end to end, then leave it validated and ready to sync.

## 1. Gather the fields

Ask the user (batch the questions, don't interrogate one at a time unless they want that):

- **name** -- a short kebab-case slug (this becomes the directory name).
- **description** -- one sentence; this is what a target system shows to decide relevance.
- **trigger keywords** -- words/phrases that should activate this skill.
- **capabilities** -- for each of `reads_files`, `writes_files`, `network`, `shell_exec`, `spawn_subagents`: does this skill need it? If `shell_exec` is yes, which specific `tools` (e.g. `git`, `python`)?
- **approval** -- `required` (default, safest), `auto` (request auto-approval where the target system supports it), or `inherit` (defer to the host's own policy, make no request).
- **which systems** to enable (claude/gemini/codex/chatgpt, or a custom one already registered via `ista system list`).

Don't over-ask: if the user just describes what they want in prose, infer reasonable defaults for the fields they didn't specify explicitly (most new skills need `reads_files: true` and nothing else) and confirm before writing.

## 2. Scaffold it

Run `ista skill new <name>` (from the project or user scope the user wants it in -- ask if unclear, per Ista's scope model: project scope if you're inside a project's `.ista/`, user scope otherwise).

## 3. Fill it in

- Edit the generated `skill.yaml` with the capabilities/trigger/systems gathered above.
- Write `body.md` -- the actual instructions this skill gives an agent. Draft it based on what the user described, then show it to them before finalizing.

## 4. Validate and report

Run `ista skill validate`. If it fails, fix the issues and re-run. Once it passes, tell the user the skill is ready and that `ista sync` will compile it to every enabled system.
