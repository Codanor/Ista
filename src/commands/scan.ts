import { existsSync } from "node:fs";
import { join } from "node:path";
import { listCategories, readCategoryIndex } from "../category.ts";
import { currentScope, resolveScopeRoot } from "../scope.ts";
import { findSkillInScope, listSkills } from "../store.ts";
import { resolveCompilers } from "./sync.ts";

// Detects drift between the meta-schema store and each system's native
// output (§9.7): skills a system knows about that Ista doesn't (native-only),
// skills Ista knows about that were never compiled for an enabled system
// (meta-only), and category refs (§8) that no longer resolve to anything
// (e.g. the linked skill was deleted with --force, leaving a dangling ref).
export async function runScan(cwd: string): Promise<void> {
  const { root } = currentScope(cwd);
  const { compilers: COMPILERS, errors } = await resolveCompilers(root);
  const metaSkills = listSkills(root);
  const metaNames = new Set(metaSkills.map((s) => s.meta.name));

  let found = errors.length;
  for (const err of errors) console.log(`[warn] ${err}`);

  for (const [systemId, compiler] of Object.entries(COMPILERS)) {
    const nativeRoot = join(root, `.${systemId}`, "skills");
    for (const detected of compiler.parse(nativeRoot)) {
      const name = detected.suggested.name;
      if (name && !metaNames.has(name)) {
        console.log(
          `[native-only] ${systemId}: "${name}" exists at ${detected.sourcePath} but isn't tracked in .ista/skills.`,
        );
        found++;
      }
    }
  }

  for (const { meta } of metaSkills) {
    for (const [systemId, cfg] of Object.entries(meta.systems)) {
      if (!cfg.enabled || !COMPILERS[systemId]) continue;
      const targetPath = join(root, `.${systemId}`, "skills", meta.name, "SKILL.md");
      if (!existsSync(targetPath)) {
        console.log(`[meta-only] "${meta.name}" is enabled for ${systemId} but has never been synced -- run \`ista sync\`.`);
        found++;
      }
    }
  }

  for (const categoryName of listCategories(root)) {
    for (const entry of readCategoryIndex(root, categoryName)) {
      if (typeof entry === "string") {
        if (!findSkillInScope(root, entry)) {
          console.log(`[dangling-ref] category "${categoryName}" has same-scope entry "${entry}" but no such skill exists.`);
          found++;
        }
        continue;
      }
      const targetRoot = resolveScopeRoot(entry.ref.scope, cwd);
      if (!targetRoot || !findSkillInScope(targetRoot, entry.ref.id)) {
        console.log(
          `[dangling-ref] category "${categoryName}" links to ${entry.ref.scope}:${entry.ref.id}, which no longer resolves.`,
        );
        found++;
      }
    }
  }

  console.log(found === 0 ? "No drift detected." : `\n${found} issue(s) found.`);
}
