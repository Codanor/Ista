import { currentScope, refLabel, resolveRefRoot, type ScopeLocation } from "../scope.ts";
import { forkSkill } from "../linking.ts";
import { addForkedBy } from "../linkRegistry.ts";
import { findSkillInScope } from "../store.ts";

export function runFork(cwd: string, skillName: string, from: ScopeLocation): void {
  const dest = currentScope(cwd);
  const sourceRoot = resolveRefRoot(from, cwd);
  if (!sourceRoot) {
    console.error(
      `"${refLabel(from)}" isn't available (run \`ista init\` for project scope, set org.path in ista.config.yaml for org scope, or check the path exists and has a .ista/ dir).`,
    );
    process.exitCode = 1;
    return;
  }

  const found = findSkillInScope(sourceRoot, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found at ${refLabel(from)} (${sourceRoot}).`);
    process.exitCode = 1;
    return;
  }

  const result = forkSkill(from.scope, found.dir, found.meta, dest.root, dest.scope, from.path);
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  addForkedBy(sourceRoot, found.meta.id, { scope: dest.scope, path: dest.root, id: result.meta.id });
  console.log(`Forked "${found.meta.name}" (${found.meta.id}) from ${refLabel(from)} -> ${dest.scope} as ${result.meta.id}.`);
}
