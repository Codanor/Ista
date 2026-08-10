import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addToCategory } from "../src/category.ts";
import { runScan } from "../src/commands/scan.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, skillsDir, writeSkill } from "../src/store.ts";

async function withProject<T>(fn: (root: string) => T | Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ista-scan-"));
  initScope(root);
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("runScan reports meta-only, native-only, and dangling-ref drift", async (t) => {
  await withProject(async (root) => {
    // meta-only: tracked in .ista/skills, enabled for claude, but never synced.
    const meta = parseSkillMeta({
      id: generateSkillId("unsynced"),
      name: "unsynced",
      description: "not yet compiled",
      systems: { claude: { enabled: true } },
    });
    const dir = join(skillsDir(root), "unsynced");
    writeSkill(dir, meta);
    writeFileSync(join(dir, "body.md"), "Body.\n", "utf8");

    // native-only: a hand-written SKILL.md under .claude/skills that Ista doesn't track.
    const rogueDir = join(root, ".claude", "skills", "rogue");
    mkdirSync(rogueDir, { recursive: true });
    writeFileSync(join(rogueDir, "SKILL.md"), "---\nname: rogue\ndescription: untracked\n---\n\nBody\n", "utf8");

    // dangling-ref: a category entry pointing at a skill id that doesn't exist.
    addToCategory(root, "quality", { ref: { scope: "project", id: "does-not-exist" } });

    const logs: string[] = [];
    t.mock.method(console, "log", (msg?: unknown) => {
      logs.push(String(msg));
    });

    await runScan(root);

    assert.ok(logs.some((l) => l.includes("[meta-only]") && l.includes("unsynced")));
    assert.ok(logs.some((l) => l.includes("[native-only]") && l.includes("rogue")));
    assert.ok(logs.some((l) => l.includes("[dangling-ref]") && l.includes("does-not-exist")));
  });
});
