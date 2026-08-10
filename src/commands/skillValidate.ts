import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { SkillMetaSchema } from "../schema.ts";
import { currentScopeRoot } from "../scope.ts";
import { listSkills } from "../store.ts";

export function runSkillValidate(cwd: string, path?: string): void {
  const root = currentScopeRoot(cwd);
  const targets = path ? [path] : listSkills(root).map((s) => s.dir);
  if (targets.length === 0) {
    console.log("No skills found.");
    return;
  }

  let failures = 0;
  for (const dir of targets) {
    try {
      const raw = yaml.load(readFileSync(join(dir, "skill.yaml"), "utf8"));
      const result = SkillMetaSchema.safeParse(raw);
      if (result.success) {
        console.log(`OK   ${dir}`);
      } else {
        failures++;
        console.log(`FAIL ${dir}`);
        for (const issue of result.error.issues) {
          console.log(`     ${issue.path.join(".")}: ${issue.message}`);
        }
      }
    } catch (err) {
      failures++;
      console.log(`FAIL ${dir}`);
      console.log(`     ${(err as Error).message}`);
    }
  }

  if (failures > 0) process.exitCode = 1;
}
