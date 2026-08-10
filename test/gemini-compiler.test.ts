import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { geminiCompiler } from "../src/compiler/gemini.ts";
import type { ResolvedSkill } from "../src/compiler/types.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, resolveSkill, skillsDir, writeSkill } from "../src/store.ts";

function makeSkill(root: string, capabilities: Record<string, unknown> = {}): ResolvedSkill {
  const meta = parseSkillMeta({
    id: generateSkillId("code-review"),
    name: "code-review",
    description: "Reviews code changes",
    capabilities: { shell_exec: true, tools: ["git"], reads_files: true, ...capabilities },
    systems: { gemini: { enabled: true } },
  });
  const dir = join(skillsDir(root), meta.name);
  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), "Body content.\n", "utf8");
  return resolveSkill(dir, meta);
}

test("compile writes SKILL.md and a real policies/*.toml expressing the capability intent", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    const result = geminiCompiler.compile(skill, { projectRoot: root, force: false });

    const skillPath = join(root, ".gemini", "skills", "code-review", "SKILL.md");
    const policyPath = join(root, ".gemini", "skills", "code-review", "policies", "code-review.toml");
    assert.ok(result.filesWritten.includes(skillPath));
    assert.ok(result.filesWritten.includes(policyPath));

    const policy = readFileSync(policyPath, "utf8");
    assert.match(policy, /shell_exec = true/);
    assert.match(policy, /tools = \["git"\]/);
    assert.match(policy, /reads_files = true/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("supports() marks capabilities enforced but approval only advised", () => {
  const report = geminiCompiler.supports();
  assert.equal(report.shell_exec, "enforce");
  assert.equal(report.network, "enforce");
  assert.equal(report.approval, "advise");
});

test("validate() flags approval=auto since Gemini always prompts for consent", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root, { approval: "auto" });
    const issues = geminiCompiler.validate(skill);
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.message, /always requires per-activation user consent/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
