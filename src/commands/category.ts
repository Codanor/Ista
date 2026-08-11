import type { CategoryEntry } from "../category.ts";
import { addToCategory, listCategories, readCategoryIndex } from "../category.ts";
import { currentScope, refLabel, resolveRefRoot } from "../scope.ts";
import { findSkillInScope } from "../store.ts";

export function runCategoryAdd(cwd: string, skillName: string, categoryName: string): void {
  const { root } = currentScope(cwd);
  const found = findSkillInScope(root, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found.`);
    process.exitCode = 1;
    return;
  }
  addToCategory(root, categoryName, found.meta.name);
  console.log(`Added "${found.meta.name}" to category "${categoryName}".`);
}

export function runCategoryList(cwd: string): void {
  const { root } = currentScope(cwd);
  const categories = listCategories(root);
  if (categories.length === 0) {
    console.log("No categories yet. `ista link`/`ista move` create one, or hand-edit .ista/categories/<name>/index.yaml.");
    return;
  }
  for (const name of categories) {
    const count = readCategoryIndex(root, name).length;
    console.log(`${name}  (${count} skill${count === 1 ? "" : "s"})`);
  }
}

function describeEntry(cwd: string, localRoot: string, entry: CategoryEntry): string {
  if (typeof entry === "string") {
    const found = findSkillInScope(localRoot, entry);
    return found ? `${found.meta.name} (${found.meta.id})` : `[missing skill "${entry}"]`;
  }
  const targetRoot = resolveRefRoot(entry.ref, cwd);
  const found = targetRoot ? findSkillInScope(targetRoot, entry.ref.id) : null;
  const label = refLabel(entry.ref);
  return found ? `${found.meta.name} (${label}:${entry.ref.id})` : `[unresolved ref ${label}:${entry.ref.id}]`;
}

export function runCategoryTree(cwd: string): void {
  const { root } = currentScope(cwd);
  const categories = listCategories(root);
  if (categories.length === 0) {
    console.log("No categories yet.");
    return;
  }
  for (const name of categories) {
    console.log(`${name}/`);
    for (const entry of readCategoryIndex(root, name)) {
      console.log(`  - ${describeEntry(cwd, root, entry)}`);
    }
  }
}
