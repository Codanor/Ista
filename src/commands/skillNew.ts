import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateSkillId } from "../id.ts";
import { parseSkillMeta } from "../schema.ts";
import { currentScope } from "../scope.ts";
import { skillsDir, writeSkill } from "../store.ts";

export function runSkillNew(cwd: string, name: string): void {
  const { scope, root } = currentScope(cwd);
  const dir = join(skillsDir(root), name);
  if (existsSync(dir)) {
    console.error(`Skill "${name}" already exists at ${dir}`);
    process.exitCode = 1;
    return;
  }

  const meta = parseSkillMeta({
    id: generateSkillId(name),
    name,
    description: `TODO: describe what ${name} does`,
    scope,
    systems: { claude: { enabled: true } },
  });

  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), `# ${name}\n\nTODO: write the skill body.\n`, "utf8");
  console.log(`Created skill "${name}" (${meta.id}) at ${dir}`);
}
