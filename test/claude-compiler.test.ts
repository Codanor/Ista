import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { claudeCompiler } from "../src/compiler/claude.ts";
import type { ResolvedSkill } from "../src/compiler/types.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, resolveSkill, skillsDir, writeSkill } from "../src/store.ts";

function makeSkill(root: string): ResolvedSkill {
  const meta = parseSkillMeta({
    id: generateSkillId("code-review"),
    name: "code-review",
    description: "Reviews code changes",
    capabilities: { shell_exec: true, tools: ["git"], reads_files: true, approval: "required" },
    systems: { claude: { enabled: true } },
  });
  const dir = join(skillsDir(root), meta.name);
  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), "Body content.\n", "utf8");
  return resolveSkill(dir, meta);
}

test("compile maps capabilities to allowed-tools and writes SKILL.md", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    const result = claudeCompiler.compile(skill, { projectRoot: root, force: false });

    const targetPath = join(root, ".claude", "skills", "code-review", "SKILL.md");
    assert.ok(result.filesWritten.includes(targetPath));
    const content = readFileSync(targetPath, "utf8");
    assert.match(content, /allowed-tools:/);
    assert.match(content, /Read/);
    assert.match(content, /Bash\(git:\*\)/);
    assert.match(content, /Body content\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-sync with no changes is idempotent (no rewrite)", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    claudeCompiler.compile(skill, { projectRoot: root, force: false });
    const second = claudeCompiler.compile(skill, { projectRoot: root, force: false });
    assert.deepEqual(second.filesWritten, []);
    assert.deepEqual(second.skipped, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("manual edit outside ista is detected and not clobbered without --force", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    claudeCompiler.compile(skill, { projectRoot: root, force: false });

    const targetPath = join(root, ".claude", "skills", "code-review", "SKILL.md");
    writeFileSync(targetPath, "hand-edited content", "utf8");

    const result = claudeCompiler.compile(skill, { projectRoot: root, force: false });
    assert.deepEqual(result.filesWritten, []);
    assert.ok(result.skipped.includes(targetPath));
    assert.equal(readFileSync(targetPath, "utf8"), "hand-edited content");

    const forced = claudeCompiler.compile(skill, { projectRoot: root, force: true });
    assert.ok(forced.filesWritten.includes(targetPath));
    assert.notEqual(readFileSync(targetPath, "utf8"), "hand-edited content");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parse() finds a compiled skill back off disk (powers `ista scan`)", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const skill = makeSkill(root);
    claudeCompiler.compile(skill, { projectRoot: root, force: false });

    const nativeRoot = join(root, ".claude", "skills");
    const detected = claudeCompiler.parse(nativeRoot);
    assert.equal(detected.length, 1);
    assert.equal(detected[0]!.suggested.name, "code-review");
    assert.equal(detected[0]!.suggested.description, "Reviews code changes");

    assert.deepEqual(claudeCompiler.parse(join(root, ".claude", "does-not-exist")), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
