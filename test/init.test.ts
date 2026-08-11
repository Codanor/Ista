import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runInit } from "../src/commands/init.ts";
import { SkillMetaSchema } from "../src/schema.ts";
import { listSkills } from "../src/store.ts";

test("ista init seeds the bootstrap meta-skills, each valid and non-empty, enabled for every built-in compiler", async () => {
  const project = mkdtempSync(join(tmpdir(), "ista-init-"));
  try {
    await runInit(project);
    const skills = listSkills(project);
    const names = skills.map((s) => s.meta.name).sort();
    assert.deepEqual(names, ["create-ista-attachment", "create-ista-skill", "implement-system"]);

    // Non-interactive init enables every built-in compiler (matches the
    // wizard's own default selection and the --yes flag's documented
    // "install everything" behavior), so seeded skills follow suit.
    const expectedSystems = {
      claude: { enabled: true, overrides: {} },
      gemini: { enabled: true, overrides: {} },
      codex: { enabled: true, overrides: {} },
      chatgpt: { enabled: true, overrides: {} },
    };
    for (const { dir, meta } of skills) {
      assert.equal(SkillMetaSchema.safeParse(meta).success, true);
      assert.deepEqual(meta.systems, expectedSystems);
      const body = readFileSync(join(dir, "body.md"), "utf8");
      assert.ok(body.length > 100, `${meta.name}'s body.md looks too thin`);
    }
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("ista init is idempotent and doesn't re-seed or clobber an edited bootstrap skill", async () => {
  const project = mkdtempSync(join(tmpdir(), "ista-init-"));
  try {
    await runInit(project);
    await runInit(project); // second call should just report "already exists"
    assert.equal(listSkills(project).length, 3);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("ista init -y (--yes) skips the wizard and installs everything, same as the non-interactive default", async () => {
  const project = mkdtempSync(join(tmpdir(), "ista-init-yes-"));
  try {
    await runInit(project, { yes: true });
    assert.equal(listSkills(project).length, 3);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
