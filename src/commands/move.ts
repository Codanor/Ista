import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseSkillMeta, type Scope } from "../schema.ts";
import { writeLink } from "../linking.ts";
import { currentScope, refLabel, resolveRefRoot, type ScopeLocation } from "../scope.ts";
import { findSkillInScope, skillsDir, writeSkill } from "../store.ts";

export function runMove(cwd: string, skillName: string, target: ScopeLocation, opts: { category: string }): void {
  const source = currentScope(cwd);
  const targetRoot = resolveRefRoot(target, cwd);
  if (!targetRoot) {
    console.error(
      `"${refLabel(target)}" isn't available (run \`ista init\` for project scope, set org.path in ista.config.yaml for org scope, or check the path exists and has a .ista/ dir).`,
    );
    process.exitCode = 1;
    return;
  }
  if (targetRoot === source.root) {
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

  // An external project (scope "path") is still structurally project-scope
  // from its own point of view -- "path" only ever describes how *we*
  // reached it, never what the skill itself considers its home.
  const destMetaScope: Scope = target.scope === "path" ? "project" : target.scope;

  mkdirSync(dirname(destDir), { recursive: true });
  cpSync(found.dir, destDir, { recursive: true });
  writeSkill(destDir, parseSkillMeta({ ...found.meta, scope: destMetaScope }));
  rmSync(found.dir, { recursive: true, force: true });

  // Leave a ref back where the skill used to physically live, so it's still
  // discoverable from there (§9.3) -- exactly `ista link` run in reverse.
  writeLink(targetRoot, target.scope, found.meta.id, source.root, source.scope, opts.category, target.path);

  console.log(`Moved "${found.meta.name}" (${found.meta.id}) from ${source.scope} -> ${refLabel(target)}.`);
  console.log(`Left a link back at ${source.root} (category "${opts.category}").`);
}
