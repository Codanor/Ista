// Scope resolution (§7): project -> user -> org, project always winning on
// a name/id collision. Org scope is a local .ista-shaped directory for now
// (its `path` comes from ista.config.yaml) -- fetching it from a real git
// remote is `ista push`/`pull`, Phase 4 work. Until then, pointing org.path
// at a directory someone syncs by hand (or a shared drive) is a perfectly
// real way to use it; Ista just doesn't own the transport yet.
import { existsSync } from "node:fs";
import type { IstaConfig, RefScope, Scope, SkillMeta } from "./schema.ts";
import { ensureUserScope, findIstaRoot, findSkillInScope, istaDir, readConfig, userScopePath } from "./store.ts";

// A resolved reference target: one of the three named scopes, or a literal
// external project directory (scope "path"). `path` is set only in the
// latter case -- the CLI escape hatch for linking/forking directly between
// two unrelated project trees without a shared org mirror in between.
export interface ScopeLocation {
  scope: RefScope;
  path?: string;
}

export function refLabel(ref: ScopeLocation): string {
  return ref.scope === "path" ? ref.path! : ref.scope;
}

// project config wins over user config when both declare an org block.
function orgConfigCandidates(cwd: string): string[] {
  const projectRoot = findIstaRoot(cwd);
  return [projectRoot, userScopePath()].filter((r): r is string => r !== null);
}

// The default target for commands that don't take an explicit scope argument:
// project if one is found walking up from cwd, otherwise user scope (which
// always exists -- "created on first ista invocation if absent", §3, meaning
// the first invocation that actually *needs* it, not every invocation --
// resolving scope must not eagerly create ~/.ista as a side effect of merely
// checking whether cwd is inside a project).
// A `.ista` found walking up is only really a *project* if it isn't the same
// directory as the user scope root -- otherwise cwd is just sitting inside
// (or at) the user scope itself (e.g. `cd ~ && ista skill delete foo`), and
// mislabeling it "project" would tag registry/category bookkeeping wrong.
export function currentScope(cwd: string): { scope: Scope; root: string } {
  const project = findIstaRoot(cwd);
  if (project) {
    if (project === userScopePath()) return { scope: "user", root: ensureUserScope() };
    if (project === resolveOrgRoot(cwd)) return { scope: "org", root: project };
    return { scope: "project", root: project };
  }
  return { scope: "user", root: ensureUserScope() };
}

export function currentScopeRoot(cwd: string): string {
  return currentScope(cwd).root;
}

export function resolveOrgRoot(cwd: string): string | null {
  // readConfig tolerates a path that doesn't exist yet (returns defaults),
  // so checking the user-scope candidate here never needs to create it.
  for (const root of orgConfigCandidates(cwd)) {
    const path = readConfig(root).org?.path;
    if (path && existsSync(istaDir(path))) return path;
  }
  return null;
}

// Like resolveOrgRoot, but returns the configured {path, remote} even before
// the local mirror exists -- `ista pull` needs this to know where to clone
// *to* and *from* on the very first run.
export function findOrgConfig(cwd: string): NonNullable<IstaConfig["org"]> | null {
  for (const root of orgConfigCandidates(cwd)) {
    const org = readConfig(root).org;
    if (org) return org;
  }
  return null;
}

export function resolveScopeRoot(scope: Scope, cwd: string): string | null {
  if (scope === "project") return findIstaRoot(cwd);
  if (scope === "user") return ensureUserScope();
  return resolveOrgRoot(cwd);
}

// Like resolveScopeRoot, but also accepts scope "path" -- resolved directly
// against the filesystem instead of cwd, and only valid if a .ista/ actually
// lives there (same existence bar the three named scopes are held to).
export function resolveRefRoot(ref: ScopeLocation, cwd: string): string | null {
  if (ref.scope === "path") return ref.path && existsSync(istaDir(ref.path)) ? ref.path : null;
  return resolveScopeRoot(ref.scope, cwd);
}

export function findSkillAcrossScopes(
  cwd: string,
  nameOrId: string,
): { scope: Scope; root: string; dir: string; meta: SkillMeta } | null {
  for (const scope of ["project", "user", "org"] as const) {
    const root = resolveScopeRoot(scope, cwd);
    if (!root) continue;
    const found = findSkillInScope(root, nameOrId);
    if (found) return { scope, root, ...found };
  }
  return null;
}
