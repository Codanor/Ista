import { currentScope, refLabel, resolveRefRoot, type ScopeLocation } from "../scope.ts";
import { findSkillInScope } from "../store.ts";
import { writeLink } from "../linking.ts";

export function runLink(cwd: string, skillName: string, from: ScopeLocation, opts: { category: string }): void {
  const dest = currentScope(cwd);
  const sourceRoot = resolveRefRoot(from, cwd);
  if (!sourceRoot) {
    console.error(
      `"${refLabel(from)}" isn't available (run \`ista init\` for project scope, set org.path in ista.config.yaml for org scope, or check the path exists and has a .ista/ dir).`,
    );
    process.exitCode = 1;
    return;
  }
  if (sourceRoot === dest.root) {
    console.error(`"${skillName}" is already in ${dest.scope} scope -- nothing to link.`);
    process.exitCode = 1;
    return;
  }

  const found = findSkillInScope(sourceRoot, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found at ${refLabel(from)} (${sourceRoot}).`);
    process.exitCode = 1;
    return;
  }

  writeLink(sourceRoot, from.scope, found.meta.id, dest.root, dest.scope, opts.category, from.path);
  console.log(
    `Linked "${found.meta.name}" (${found.meta.id}) from ${refLabel(from)} into ${dest.scope} scope, category "${opts.category}".`,
  );
}
