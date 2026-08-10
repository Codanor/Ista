import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSkillMeta, type Scope } from "../schema.ts";
import { writeLink } from "../linking.ts";
import { currentScope, resolveScopeRoot } from "../scope.ts";
import { findSkillInScope, skillsDir, writeSkill } from "../store.ts";

export function runMove(cwd: string, skillName: string, targetScope: Scope, opts: { category: string }): void {
  const source = currentScope(cwd);
  const targetRoot = resolveScopeRoot(targetScope, cwd);
  if (!targetRoot) {
    console.error(
      `Scope "${targetScope}" isn't available here (run \`ista init\` for project scope, or set org.path in ista.config.yaml for org scope).`,
    );
    process.exitCode = 1;
    return;
  }
  if (targetScope === source.scope && targetRoot === source.root) {
    console.error(`"${skillName}" is already in ${source.scope} scope -- nothing to move.`);
    process.exitCode = 1;
    return;
  }

  const found = findSkillInScope(source.root, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found in ${source.scope} scope (${source.root}).`);
    process.exitCode = 1;
    return;
  }

  const destDir = join(skillsDir(targetRoot), found.meta.name);
  if (existsSync(destDir)) {
    console.error(`A skill named "${found.meta.name}" already exists at ${destDir}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(dirname(destDir), { recursive: true });
  cpSync(found.dir, destDir, { recursive: true });
  writeSkill(destDir, parseSkillMeta({ ...found.meta, scope: targetScope }));
  rmSync(found.dir, { recursive: true, force: true });

  // Leave a ref back where the skill used to physically live, so it's still
  // discoverable from there (§9.3) -- exactly `ista link` run in reverse.
  writeLink(targetRoot, targetScope, found.meta.id, source.root, source.scope, opts.category);

  console.log(`Moved "${found.meta.name}" (${found.meta.id}) from ${source.scope} -> ${targetScope}.`);
  console.log(`Left a link back at ${source.root} (category "${opts.category}").`);
}
