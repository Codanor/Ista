import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";
import { runSync } from "../src/commands/sync.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { configPath, initScope, skillsDir, writeSkill } from "../src/store.ts";

async function withProject<T>(fn: (root: string) => T | Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ista-sync-"));
  initScope(root);
  try {
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeTestSkill(root: string, name: string, overrides: Record<string, unknown> = {}) {
  const meta = parseSkillMeta({
    id: generateSkillId(name),
    name,
    description: "A test skill",
    ...overrides,
  });
  const dir = join(skillsDir(root), name);
  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), "Body.\n", "utf8");
  return meta;
}

test("runSync prints a capability-honesty warning for a system that can only advise, and compiles every enabled system", async (t) => {
  await withProject(async (root) => {
    writeTestSkill(root, "net-skill", {
      capabilities: { network: true },
      systems: { claude: { enabled: true }, codex: { enabled: true } },
    });

    const logs: string[] = [];
    t.mock.method(console, "log", (msg?: unknown) => {
      logs.push(String(msg));
    });

    await runSync(root, { force: false });

    assert.ok(
      logs.some((l) => l.includes('capabilities.network is only "advise"') && l.includes("codex")),
      "expected a capability-honesty warning for codex",
    );
    assert.ok(existsSync(join(root, ".claude", "skills", "net-skill", "SKILL.md")));
    assert.ok(existsSync(join(root, ".codex", "skills", "net-skill", "SKILL.md")));
  });
});

test("runSync respects a scope-level system veto and warns instead of crashing on an unregistered system", async (t) => {
  await withProject(async (root) => {
    writeFileSync(
      configPath(root),
      yaml.dump({ systems: { claude: { enabled: true }, codex: { enabled: false } } }),
      "utf8",
    );
    writeTestSkill(root, "vetoed-skill", { systems: { claude: { enabled: true }, codex: { enabled: true } } });
    writeTestSkill(root, "ghost-skill", { systems: { ghost: { enabled: true } } });

    const logs: string[] = [];
    t.mock.method(console, "log", (msg?: unknown) => {
      logs.push(String(msg));
    });

    await runSync(root, { force: false });

    assert.ok(!existsSync(join(root, ".codex", "skills", "vetoed-skill")), "codex is vetoed at scope level");
    assert.ok(
      logs.some((l) => l.includes('no compiler registered for system "ghost"')),
      "expected a warning instead of a crash for the unregistered system",
    );
  });
});
