// Shared physical operations behind `ista link`, `ista move`, `ista fork`,
// and `ista skill delete --convert-to-forks` -- kept here once instead of
// reimplemented per command.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ResolvedSkill } from "./compiler/types.ts";
import { addToCategory, type CategoryEntry } from "./category.ts";
import { generateSkillId } from "./id.ts";
import { addLinkedBy } from "./linkRegistry.ts";
import { parseSkillMeta, type Scope, type SkillMeta } from "./schema.ts";
import { resolveSkill, skillsDir, writeSkill } from "./store.ts";

// What `ista update` (§9.5) recomputes to detect whether a fork has been
// hand-edited since it was forked/last updated. Deliberately scoped to what
// `ista update` actually diffs -- capabilities + body + attachments.
// Resources/scripts drift detection is left for later; most forks won't have
// any, and adding it is additive whenever it's needed.
export function computeContentHash(
  resolved: Pick<ResolvedSkill, "capabilities" | "bodyContent" | "attachmentContents">,
): string {
  const payload = JSON.stringify({
    capabilities: resolved.capabilities,
    bodyContent: resolved.bodyContent,
    attachmentContents: resolved.attachmentContents,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export type ForkResult = { ok: true; meta: SkillMeta; dir: string } | { ok: false; error: string };

export function forkSkill(
  sourceScope: Scope,
  sourceDir: string,
  sourceMeta: SkillMeta,
  destRoot: string,
  destScope: Scope,
): ForkResult {
  const destDir = join(skillsDir(destRoot), sourceMeta.name);
  if (existsSync(destDir)) {
    return { ok: false, error: `A skill named "${sourceMeta.name}" already exists at ${destDir}` };
  }

  const resolved = resolveSkill(sourceDir, sourceMeta);
  const newMeta = parseSkillMeta({
    ...sourceMeta,
    id: generateSkillId(sourceMeta.name),
    scope: destScope,
    forked_from: {
      scope: sourceScope,
      id: sourceMeta.id,
      version: sourceMeta.version,
      content_hash: computeContentHash(resolved),
    },
  });

  writeSkill(destDir, newMeta);
  writeFileSync(join(destDir, sourceMeta.body), resolved.bodyContent, "utf8");
  for (const attachment of resolved.attachmentContents) {
    const target = join(destDir, attachment.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, attachment.content, "utf8");
  }
  for (const folder of ["resources", "scripts"]) {
    const src = join(sourceDir, folder);
    if (existsSync(src)) cpSync(src, join(destDir, folder), { recursive: true });
  }

  return { ok: true, meta: newMeta, dir: destDir };
}

// A link (§9.2) is a category-index entry at the destination whose ref
// points back at the source, plus a transactional backlink record at the
// source -- the same primitive §8 already uses for cross-scope refs.
export function writeLink(
  sourceRoot: string,
  sourceScope: Scope,
  sourceId: string,
  destRoot: string,
  destScope: Scope,
  category: string,
): void {
  const entry: CategoryEntry = { ref: { scope: sourceScope, id: sourceId } };
  addToCategory(destRoot, category, entry);
  addLinkedBy(sourceRoot, sourceId, { scope: destScope, path: destRoot });
}
