import { readCategoryIndex } from "../category.ts";
import { currentScope, resolveScopeRoot } from "../scope.ts";
import { findSkillInScope, listSkills } from "../store.ts";
import type { SkillMeta } from "../schema.ts";

function printSkill(meta: SkillMeta, tag?: string): void {
  const suffix = tag ? `  [${tag}]` : "";
  console.log(`${meta.id}  ${meta.name}  v${meta.version}  - ${meta.description}${suffix}`);
}

export function runSkillList(cwd: string, opts: { category?: string }): void {
  const { root } = currentScope(cwd);

  if (!opts.category) {
    const skills = listSkills(root);
    if (skills.length === 0) {
      console.log("No skills yet. Run `ista skill new <name>`.");
      return;
    }
    for (const { meta } of skills) printSkill(meta);
    return;
  }

  const entries = readCategoryIndex(root, opts.category);
  if (entries.length === 0) {
    console.log(`No skills in category "${opts.category}".`);
    return;
  }
  for (const entry of entries) {
    if (typeof entry === "string") {
      const found = findSkillInScope(root, entry);
      if (found) printSkill(found.meta);
      else console.log(`[missing] "${entry}"`);
      continue;
    }
    const targetRoot = resolveScopeRoot(entry.ref.scope, cwd);
    const found = targetRoot ? findSkillInScope(targetRoot, entry.ref.id) : null;
    if (found) printSkill(found.meta, entry.ref.scope);
    else console.log(`[unresolved] ${entry.ref.scope}:${entry.ref.id}`);
  }
}
