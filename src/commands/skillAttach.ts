import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { parseSkillMeta } from "../schema.ts";
import { currentScope } from "../scope.ts";
import { findSkillInScope, writeSkill } from "../store.ts";

function normalizeAttachmentPath(input: string): string {
  const withDir = input.includes("/") || input.includes("\\") ? input : join("attachments", input);
  return extname(withDir) === ".md" ? withDir : `${withDir}.md`;
}

export function runSkillAttach(cwd: string, skillName: string, attachment: string): void {
  const { root } = currentScope(cwd);
  const found = findSkillInScope(root, skillName);
  if (!found) {
    console.error(`No skill named "${skillName}" found.`);
    process.exitCode = 1;
    return;
  }

  const relPath = normalizeAttachmentPath(attachment);
  const absPath = join(found.dir, relPath);
  if (!existsSync(absPath)) {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(
      absPath,
      `# ${relPath}\n\nTODO: write this attachment. It inherits the parent skill's capabilities in full -- it must not declare its own.\n`,
      "utf8",
    );
  }

  if (found.meta.attachments.includes(relPath)) {
    console.log(`"${relPath}" is already attached to "${skillName}".`);
    return;
  }

  const updated = parseSkillMeta({ ...found.meta, attachments: [...found.meta.attachments, relPath] });
  writeSkill(found.dir, updated);
  console.log(`Attached ${relPath} to "${skillName}".`);
}
