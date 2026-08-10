import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { findIstaRoot, initScope, listSkills, readSkill, skillsDir, writeSkill } from "../src/store.ts";

test("init + write + list round-trips a skill", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    assert.equal(findIstaRoot(root), root);

    const meta = parseSkillMeta({
      id: generateSkillId("code-review"),
      name: "code-review",
      description: "Reviews code changes",
    });
    const dir = join(skillsDir(root), meta.name);
    writeSkill(dir, meta);

    const skills = listSkills(root);
    assert.equal(skills.length, 1);
    assert.equal(skills[0]!.meta.id, meta.id);
    assert.deepEqual(readSkill(dir), meta);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("findIstaRoot walks up from a nested cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "ista-test-"));
  try {
    initScope(root);
    const nested = join(root, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    assert.equal(findIstaRoot(nested), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
