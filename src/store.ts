import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import yaml from "js-yaml";
import { parseIstaConfig, parseSkillMeta, type IstaConfig, type SkillMeta } from "./schema.ts";
import type { ResolvedSkill } from "./compiler/types.ts";

export function istaDir(root: string): string {
  return join(root, ".ista");
}

export function skillsDir(root: string): string {
  return join(istaDir(root), "skills");
}

export function categoriesDir(root: string): string {
  return join(istaDir(root), "categories");
}

export function linkRegistryPath(root: string): string {
  return join(istaDir(root), "link-registry.yaml");
}

export function configPath(root: string): string {
  return join(istaDir(root), "ista.config.yaml");
}

// Walks up from `cwd` looking for a `.ista/` directory, the way `git` finds
// its repo root. Returns null if none is found (caller should tell the user
// to run `ista init`).
export function findIstaRoot(cwd: string): string | null {
  let dir = resolve(cwd);
  while (true) {
    if (existsSync(istaDir(dir))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function initScope(root: string): void {
  mkdirSync(skillsDir(root), { recursive: true });
  mkdirSync(categoriesDir(root), { recursive: true });
  if (!existsSync(configPath(root))) {
    writeFileSync(configPath(root), yaml.dump({ systems: { claude: { enabled: true } } }), "utf8");
  }
  if (!existsSync(linkRegistryPath(root))) {
    writeFileSync(linkRegistryPath(root), yaml.dump({}), "utf8");
  }
}

// Where ~/.ista lives, without touching the filesystem. ISTA_HOME lets tests
// (and cautious manual runs) redirect this away from the real home dir.
export function userScopePath(): string {
  return process.env.ISTA_HOME ?? homedir();
}

// "created on first ista invocation if absent" (§3) -- but only the
// invocation that actually *uses* user scope, not every invocation. Callers
// that just need to know *where* it is (e.g. to check "is cwd already
// inside it") should use userScopePath() instead so merely resolving scope
// doesn't eagerly create ~/.ista as a side effect.
export function ensureUserScope(home: string = userScopePath()): string {
  if (!existsSync(istaDir(home))) initScope(home);
  return home;
}

export function readConfig(root: string): IstaConfig {
  if (!existsSync(configPath(root))) return parseIstaConfig({});
  return parseIstaConfig(yaml.load(readFileSync(configPath(root), "utf8")));
}

export function readSkill(skillDir: string): SkillMeta {
  const raw = yaml.load(readFileSync(join(skillDir, "skill.yaml"), "utf8"));
  return parseSkillMeta(raw);
}

export function writeSkill(skillDir: string, meta: SkillMeta): void {
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "skill.yaml"), yaml.dump(meta), "utf8");
}

export function listSkills(root: string): { dir: string; meta: SkillMeta }[] {
  const base = skillsDir(root);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(base, entry.name))
    .filter((dir) => existsSync(join(dir, "skill.yaml")))
    .map((dir) => ({ dir, meta: readSkill(dir) }));
}

// Looks a skill up by directory name first (the common case), falling back
// to matching on the stable `id` field — cross-scope commands (§9.1) take a
// user-friendly name on the CLI but key all bookkeeping off id.
export function findSkillInScope(root: string, nameOrId: string): { dir: string; meta: SkillMeta } | null {
  const byName = join(skillsDir(root), nameOrId);
  if (existsSync(join(byName, "skill.yaml"))) {
    return { dir: byName, meta: readSkill(byName) };
  }
  return listSkills(root).find((s) => s.meta.id === nameOrId) ?? null;
}

// Reads body.md + every attachment file off disk and merges them onto the
// skill.yaml fields (whose defaults are already applied by the schema),
// producing the fully-resolved shape every compiler's compile() expects.
export function resolveSkill(skillDir: string, meta: SkillMeta): ResolvedSkill {
  const bodyContent = readFileSync(join(skillDir, meta.body), "utf8");
  const attachmentContents = meta.attachments.map((relPath) => ({
    path: relPath,
    content: readFileSync(join(skillDir, relPath), "utf8"),
  }));
  return { ...meta, dir: skillDir, bodyContent, attachmentContents };
}
