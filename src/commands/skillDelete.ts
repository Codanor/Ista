import { rmSync } from "node:fs";
import { removeIdFromAllCategories, replaceRefInAllCategories } from "../category.ts";
import { confirm } from "../confirm.ts";
import { forkSkill } from "../linking.ts";
import { addForkedBy, getRegistryEntry, removeLinkedBy, removeRegistryEntry } from "../linkRegistry.ts";
import { currentScope } from "../scope.ts";
import { findSkillInScope } from "../store.ts";

// Backlink-aware delete (§9.6): refuses by default if anything links to this
// skill, since deleting it would leave those refs dangling. --force deletes
// anyway (dangling refs get flagged by a later `ista scan`); --convert-to-forks
// (or an interactive y/n) turns every linker into an independent copy first.
export async function runSkillDelete(
  cwd: string,
  skillName: string,
  opts: { force: boolean; convertToForks: boolean },
): Promise<void> {
  const { scope, root } = currentScope(cwd);
  const found = findSkillInScope(root, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found.`);
    process.exitCode = 1;
    return;
  }

  const entry = getRegistryEntry(root, found.meta.id);

  if (entry.linked_by.length > 0) {
    console.log(`${entry.linked_by.length} scope(s) link to "${skillName}":`);
    for (const b of entry.linked_by) console.log(`  - ${b.scope}: ${b.path}`);

    let convert = opts.convertToForks;
    if (!opts.force && !convert) {
      convert = await confirm("Convert these links to independent forks and proceed with delete? (y/N) ");
      if (!convert) {
        console.log(
          `Refusing to delete "${skillName}" -- pass --force to delete anyway (leaves dangling links), or --convert-to-forks.`,
        );
        process.exitCode = 1;
        return;
      }
    }

    if (convert) {
      let allConverted = true;
      for (const backlink of entry.linked_by) {
        // A backlink's scope is always the linker's *own* real scope (project/
        // user/org) at the time it linked -- "path" only ever tags the far end
        // of a link, never the linker's own home, so this can't happen in
        // practice. Guarded anyway since the schema now allows it structurally.
        if (backlink.scope === "path") {
          console.error(`Cannot convert link at ${backlink.path} to a fork -- invalid backlink scope "path".`);
          allConverted = false;
          continue;
        }
        const result = forkSkill(scope, found.dir, found.meta, backlink.path, backlink.scope);
        if (!result.ok) {
          console.error(`Could not convert link at ${backlink.path}: ${result.error}`);
          allConverted = false;
          continue;
        }
        const replaced = replaceRefInAllCategories(backlink.path, root, found.meta.id, result.meta.name);
        addForkedBy(root, found.meta.id, { scope: backlink.scope, path: backlink.path, id: result.meta.id });
        removeLinkedBy(root, found.meta.id, backlink);
        console.log(`Converted link at ${backlink.path} to fork ${result.meta.id} (${replaced} category ref(s) updated).`);
      }
      // A partial conversion is exactly as unsafe as no conversion for the
      // links that failed -- don't silently proceed to delete unless --force
      // says the remaining dangling link(s) are acceptable.
      if (!allConverted && !opts.force) {
        console.error(
          `Some links could not be converted -- refusing to delete "${skillName}". Resolve the conflicts above, or pass --force to delete anyway.`,
        );
        process.exitCode = 1;
        return;
      }
    }
    // --force without --convert-to-forks: fall through and delete, leaving
    // dangling links in place, exactly as §9.6 allows.
  }

  if (entry.forked_by.length > 0) {
    console.log(`${entry.forked_by.length} scope(s) have forked "${skillName}" -- they're independent, deleting this is safe for them:`);
    for (const f of entry.forked_by) console.log(`  - ${f.scope}: ${f.path} (${f.id})`);
  }

  rmSync(found.dir, { recursive: true, force: true });
  removeIdFromAllCategories(root, found.meta.id);
  removeIdFromAllCategories(root, found.meta.name);
  removeRegistryEntry(root, found.meta.id);

  console.log(`Deleted "${skillName}" (${found.meta.id}) from ${scope} scope.`);
}
