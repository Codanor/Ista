import type { Scope } from "../schema.ts";
import { currentScope, resolveScopeRoot } from "../scope.ts";
import { forkSkill } from "../linking.ts";
import { addForkedBy } from "../linkRegistry.ts";
import { findSkillInScope } from "../store.ts";

export function runFork(cwd: string, skillName: string, from: Scope): void {
  const dest = currentScope(cwd);
  const sourceRoot = resolveScopeRoot(from, cwd);
  if (!sourceRoot) {
    console.error(
      `Scope "${from}" isn't available here (run \`ista init\` for project scope, or set org.path in ista.config.yaml for org scope).`,
    );
    process.exitCode = 1;
    return;
  }

  const found = findSkillInScope(sourceRoot, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found in ${from} scope (${sourceRoot}).`);
    process.exitCode = 1;
    return;
  }

  const result = forkSkill(from, found.dir, found.meta, dest.root, dest.scope);
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  addForkedBy(sourceRoot, found.meta.id, { scope: dest.scope, path: dest.root, id: result.meta.id });
  console.log(`Forked "${found.meta.name}" (${found.meta.id}) from ${from} -> ${dest.scope} as ${result.meta.id}.`);
}
