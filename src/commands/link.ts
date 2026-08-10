import type { Scope } from "../schema.ts";
import { currentScope, resolveScopeRoot } from "../scope.ts";
import { findSkillInScope } from "../store.ts";
import { writeLink } from "../linking.ts";

export function runLink(cwd: string, skillName: string, from: Scope, opts: { category: string }): void {
  const dest = currentScope(cwd);
  const sourceRoot = resolveScopeRoot(from, cwd);
  if (!sourceRoot) {
    console.error(
      `Scope "${from}" isn't available here (run \`ista init\` for project scope, or set org.path in ista.config.yaml for org scope).`,
    );
    process.exitCode = 1;
    return;
  }
  if (from === dest.scope && sourceRoot === dest.root) {
    console.error(`"${skillName}" is already in ${dest.scope} scope -- nothing to link.`);
    process.exitCode = 1;
    return;
  }

  const found = findSkillInScope(sourceRoot, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found in ${from} scope (${sourceRoot}).`);
    process.exitCode = 1;
    return;
  }

  writeLink(sourceRoot, from, found.meta.id, dest.root, dest.scope, opts.category);
  console.log(
    `Linked "${found.meta.name}" (${found.meta.id}) from ${from} into ${dest.scope} scope, category "${opts.category}".`,
  );
}
