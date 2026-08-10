import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { codexCompiler } from "../src/compiler/codex.ts";
import type { ResolvedSkill } from "../src/compiler/types.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, resolveSkill, skillsDir, writeSkill } from "../src/store.ts";

function makeSkill(root: string, capabilities: Record<string, unknown> = {}): ResolvedSkill {
  const meta = parseSkillMeta({
    id: generateSkillId("code-review"),
    name: "code-review",
    description: "Reviews code changes",
    capabilities: { shell_exec: true, writes_files: true, network: false, approval: "required", ...capabilities },
    systems: { codex: { enabled: true } },
  });
  const dir = join(skillsDir(root), meta.name);
  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), "Body content.\n", "utf8");
  return resolveSkill(dir, meta);
}

test("compile writes SKILL.md and a suggested config.toml, plus a loud unconditional warning", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    const result = codexCompiler.compile(skill, { projectRoot: root, force: false });

    const skillPath = join(root, ".codex", "skills", "code-review", "SKILL.md");
    const configPath = join(root, ".codex", "skills", "code-review", "suggested-config.toml");
    assert.ok(result.filesWritten.includes(skillPath));
    assert.ok(result.filesWritten.includes(configPath));
    assert.ok(result.warnings.some((w) => w.includes("no skill-scoped permission mechanism")));

    const config = readFileSync(configPath, "utf8");
    assert.match(config, /writable_roots = \["\."\]/);
    assert.match(config, /policy = "on-request"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("supports() marks nearly everything advise, spawn_subagents as ignore", () => {
  const report = codexCompiler.supports();
  assert.equal(report.shell_exec, "advise");
  assert.equal(report.approval, "advise");
  assert.equal(report.spawn_subagents, "ignore");
});

test("validate() flags approval=auto combined with a real capability", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const risky = makeSkill(root, { approval: "auto" });
    const riskyIssues = codexCompiler.validate(risky);
    assert.equal(riskyIssues.length, 1);

    const safe = makeSkill(root, { approval: "auto", shell_exec: false, writes_files: false, network: false });
    assert.deepEqual(codexCompiler.validate(safe), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
