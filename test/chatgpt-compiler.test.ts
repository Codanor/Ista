import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chatgptCompiler } from "../src/compiler/chatgpt.ts";
import type { ResolvedSkill } from "../src/compiler/types.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, resolveSkill, skillsDir, writeSkill } from "../src/store.ts";

function makeSkill(root: string): ResolvedSkill {
  const meta = parseSkillMeta({
    id: generateSkillId("code-review"),
    name: "code-review",
    description: "Reviews code changes",
    capabilities: { shell_exec: true, tools: ["git"], reads_files: true },
    systems: { chatgpt: { enabled: true } },
  });
  const dir = join(skillsDir(root), meta.name);
  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), "Body content.\n", "utf8");
  return resolveSkill(dir, meta);
}

test("compile writes copy-pasteable instructions with a manual capability checklist", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    const result = chatgptCompiler.compile(skill, { projectRoot: root, force: false });

    const targetPath = join(root, ".chatgpt", "skills", "code-review", "SKILL.md");
    assert.ok(result.filesWritten.includes(targetPath));

    const content = readFileSync(targetPath, "utf8");
    assert.match(content, /Nothing here syncs automatically/);
    assert.match(content, /No Custom GPT feature maps to shell execution/);
    assert.match(content, /Named tools requested \(git\)/);
    assert.match(content, /Body content\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("supports() has no enforce anywhere, and ignores spawn_subagents", () => {
  const report = chatgptCompiler.supports();
  assert.ok(Object.values(report).every((level) => level !== "enforce"));
  assert.equal(report.spawn_subagents, "ignore");
  assert.equal(report.approval, "advise");
});

test("parse() finds a compiled skill back off disk", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    chatgptCompiler.compile(skill, { projectRoot: root, force: false });

    const detected = chatgptCompiler.parse(join(root, ".chatgpt", "skills"));
    assert.equal(detected.length, 1);
    assert.equal(detected[0]!.suggested.name, "code-review");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
