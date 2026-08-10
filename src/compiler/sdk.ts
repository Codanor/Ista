// Shared utilities for compiler authors (§5.2). Keeps idempotency and warning
// format consistent across every compiler instead of each one reinventing it.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import { istaDir } from "../store.ts";
import type { Capabilities } from "../schema.ts";
import type { DetectedSkill, ResolvedSkill } from "./types.ts";

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function syncCachePath(root: string): string {
  return join(istaDir(root), ".sync-cache.json");
}

function readSyncCache(root: string): Record<string, string> {
  const p = syncCachePath(root);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeSyncCacheEntry(root: string, targetPath: string, content: string): void {
  const p = syncCachePath(root);
  const cache = readSyncCache(root);
  cache[targetPath] = hash(content);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(cache, null, 2), "utf8");
}

export type DiffStatus = "new" | "unchanged" | "ista-modified" | "manual-edit";

// Tells apart "nothing to do", "safe to overwrite (last write was ours)", and
// "someone hand-edited the compiled file since we last touched it" — so a
// re-sync never silently clobbers a manual edit.
export function diffAgainstExisting(root: string, targetPath: string, newContent: string): DiffStatus {
  if (!existsSync(targetPath)) return "new";
  const existing = readFileSync(targetPath, "utf8");
  if (existing === newContent) return "unchanged";
  const cachedHash = readSyncCache(root)[targetPath];
  if (cachedHash && cachedHash === hash(existing)) return "ista-modified";
  return "manual-edit";
}

export interface WriteOutcome {
  status: DiffStatus;
  written: boolean;
}

// Generic diff-protected write: any compiler artifact (SKILL.md, a policy
// TOML, a suggested config snippet) goes through this so "don't clobber a
// manual edit" is enforced once, not reimplemented per file type.
export function writeManagedFile(
  root: string,
  targetPath: string,
  content: string,
  opts: { force: boolean },
): WriteOutcome {
  const status = diffAgainstExisting(root, targetPath, content);
  if (status === "unchanged") return { status, written: false };
  if (status === "manual-edit" && !opts.force) return { status, written: false };
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, "utf8");
  writeSyncCacheEntry(root, targetPath, content);
  return { status, written: true };
}

export function writeFrontmatterFile(
  root: string,
  targetPath: string,
  frontmatter: Record<string, unknown>,
  body: string,
  opts: { force: boolean },
): WriteOutcome {
  const content = `---\n${yaml.dump(frontmatter)}---\n\n${body}`;
  return writeManagedFile(root, targetPath, content, opts);
}

// Reads a YAML-frontmatter markdown file (the shape every system's compiled
// skill file shares, per the Agent Skills open standard). Returns null if the
// file doesn't exist or isn't in that shape.
export function readFrontmatterFile(path: string): { frontmatter: Record<string, unknown>; body: string } | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const frontmatter = (yaml.load(match[1]!) ?? {}) as Record<string, unknown>;
  return { frontmatter, body: match[2]!.replace(/^\n+/, "") };
}

// Shared parse() body for every compiler that targets `<systemDir>/skills/<name>/SKILL.md`
// (all of Claude/Gemini/Codex do) — lets `ista scan` find native skills the
// meta-schema store doesn't know about yet, regardless of which system wrote them.
export function parseSkillDirectory(targetPath: string): DetectedSkill[] {
  if (!existsSync(targetPath)) return [];
  const detected: DetectedSkill[] = [];
  for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourcePath = join(targetPath, entry.name);
    const parsed = readFrontmatterFile(join(sourcePath, "SKILL.md"));
    if (!parsed) continue;
    detected.push({
      sourcePath,
      suggested: {
        name: typeof parsed.frontmatter.name === "string" ? parsed.frontmatter.name : entry.name,
        description: typeof parsed.frontmatter.description === "string" ? parsed.frontmatter.description : "",
      },
    });
  }
  return detected;
}

// One line, or null if this write had nothing manual-edit-related to report.
export function manualEditWarning(path: string, outcome: WriteOutcome): string | null {
  if (outcome.status !== "manual-edit") return null;
  return outcome.written
    ? warn(`${path} was edited outside ista; overwritten because of --force`)
    : warn(`${path} was edited outside ista; not overwritten (use --force)`);
}

export function skippedPath(path: string, outcome: WriteOutcome): string | null {
  return outcome.status === "manual-edit" && !outcome.written ? path : null;
}

// Copies the skill's resources/ and scripts/ subfolders into whatever
// subfolder convention the target system expects (default mapping mirrors
// Claude Code's own on-disk skill layout: references/, scripts/).
export function mirrorResources(
  skill: ResolvedSkill,
  targetDir: string,
  mapping: Record<string, string> = { resources: "references", scripts: "scripts" },
): string[] {
  const copied: string[] = [];
  for (const [srcFolder, destFolder] of Object.entries(mapping)) {
    const srcDir = join(skill.dir, srcFolder);
    if (!existsSync(srcDir)) continue;
    const destDir = join(targetDir, destFolder);
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true });
    copied.push(destDir);
  }
  return copied;
}

export type CapabilityMappingTable = Partial<Record<keyof Capabilities, string[]>>;

// The boring field-by-field translation: boolean capability -> fixed list of
// native tool names, only when the capability is on. Combinations that need
// cross-field logic (e.g. Claude's tools+shell_exec -> Bash(tool:*)) are left
// for the compiler itself to special-case, per §5.2.
export function mapCapabilities(capabilities: Capabilities, mappingTable: CapabilityMappingTable): string[] {
  const result: string[] = [];
  for (const key of Object.keys(mappingTable) as (keyof Capabilities)[]) {
    if (capabilities[key] === true) result.push(...(mappingTable[key] ?? []));
  }
  return result;
}

export function warn(message: string): string {
  return `[warn] ${message}`;
}

export function advise(message: string): string {
  return `[advise] ${message}`;
}
