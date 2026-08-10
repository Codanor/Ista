import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readCategoryIndex } from "../src/category.ts";
import { runFork } from "../src/commands/fork.ts";
import { runLink } from "../src/commands/link.ts";
import { runMove } from "../src/commands/move.ts";
import { runSkillDelete } from "../src/commands/skillDelete.ts";
import { runSkillNew } from "../src/commands/skillNew.ts";
import { runUpdate } from "../src/commands/update.ts";
import { generateSkillId } from "../src/id.ts";
import { getRegistryEntry } from "../src/linkRegistry.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { findSkillInScope, initScope, listSkills, skillsDir, writeSkill } from "../src/store.ts";

// "user" scope in these tests is redirected via ISTA_HOME so nothing ever
// touches the real developer machine's ~/.ista. `fn` is always awaited
// *before* cleanup runs -- awaiting a sync return value is a no-op, so this
// works uniformly for both sync and async test bodies.
async function withScopes<T>(fn: (project: string, userHome: string) => T | Promise<T>): Promise<T> {
  const project = mkdtempSync(join(tmpdir(), "ista-project-"));
  const userHome = mkdtempSync(join(tmpdir(), "ista-userhome-"));
  const previous = process.env.ISTA_HOME;
  process.env.ISTA_HOME = userHome;
  initScope(project);
  try {
    return await fn(project, userHome);
  } finally {
    if (previous === undefined) delete process.env.ISTA_HOME;
    else process.env.ISTA_HOME = previous;
    rmSync(project, { recursive: true, force: true });
    rmSync(userHome, { recursive: true, force: true });
    process.exitCode = 0;
  }
}

function writeTestSkill(root: string, name: string, overrides: Record<string, unknown> = {}) {
  const meta = parseSkillMeta({
    id: generateSkillId(name),
    name,
    description: "A test skill",
    capabilities: { shell_exec: true },
    ...overrides,
  });
  const dir = join(skillsDir(root), name);
  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), "Original body.\n", "utf8");
  return meta;
}

test("ista link references a user-scope skill from project without copying", async () => {
  await withScopes((project, userHome) => {
    const meta = writeTestSkill(userHome, "code-review");

    runLink(project, "code-review", "user", { category: "quality" });

    assert.deepEqual(readCategoryIndex(project, "quality"), [{ ref: { scope: "user", id: meta.id } }]);
    assert.equal(listSkills(project).length, 0); // nothing copied into the project's own store
    assert.deepEqual(getRegistryEntry(userHome, meta.id).linked_by, [{ scope: "project", path: project }]);
  });
});

test("ista move relocates the skill and leaves a link back", async () => {
  await withScopes((project, userHome) => {
    const meta = writeTestSkill(project, "code-review");

    runMove(project, "code-review", "user", { category: "quality" });

    assert.equal(findSkillInScope(project, "code-review"), null);
    assert.ok(findSkillInScope(userHome, "code-review"));
    assert.equal(findSkillInScope(userHome, "code-review")!.meta.scope, "user");
    assert.deepEqual(readCategoryIndex(project, "quality"), [{ ref: { scope: "user", id: meta.id } }]);
    assert.deepEqual(getRegistryEntry(userHome, meta.id).linked_by, [{ scope: "project", path: project }]);
  });
});

test("ista fork copies content into the current scope with recorded lineage", async () => {
  await withScopes((project, userHome) => {
    const meta = writeTestSkill(userHome, "code-review");

    runFork(project, "code-review", "user");

    const forked = findSkillInScope(project, "code-review");
    assert.ok(forked);
    assert.notEqual(forked!.meta.id, meta.id);
    assert.equal(forked!.meta.scope, "project");
    assert.equal(forked!.meta.forked_from?.id, meta.id);
    assert.deepEqual(getRegistryEntry(userHome, meta.id).forked_by, [
      { scope: "project", path: project, id: forked!.meta.id },
    ]);
  });
});

test("ista skill new records the actual creation scope, not just a default", async () => {
  await withScopes((_project, userHome) => {
    const noProjectCwd = mkdtempSync(join(tmpdir(), "ista-noproject-"));
    try {
      runSkillNew(noProjectCwd, "demo");
      const found = findSkillInScope(userHome, "demo");
      assert.ok(found);
      assert.equal(found!.meta.scope, "user");
    } finally {
      rmSync(noProjectCwd, { recursive: true, force: true });
    }
  });
});

test("ista update fast-forwards an unmodified fork and requires --force for a diverged one", async () => {
  await withScopes(async (project, userHome) => {
    writeTestSkill(userHome, "code-review");
    runFork(project, "code-review", "user");
    const fork = findSkillInScope(project, "code-review")!;

    // Truth changes; fork hasn't been touched -> fast-forward, no --force needed.
    writeFileSync(join(skillsDir(userHome), "code-review", "body.md"), "Updated body v2.\n", "utf8");
    await runUpdate(project, "code-review", "user", ["project"], { force: false });
    assert.equal(readFileSync(join(fork.dir, "body.md"), "utf8"), "Updated body v2.\n");

    // Fork now diverges locally; truth changes again.
    writeFileSync(join(fork.dir, "body.md"), "Locally edited.\n", "utf8");
    writeFileSync(join(skillsDir(userHome), "code-review", "body.md"), "Updated body v3.\n", "utf8");

    // Non-interactive (no TTY) + no --force -> refuses, local edit preserved.
    await runUpdate(project, "code-review", "user", ["project"], { force: false });
    assert.equal(readFileSync(join(fork.dir, "body.md"), "utf8"), "Locally edited.\n");

    // --force applies over the local edit.
    await runUpdate(project, "code-review", "user", ["project"], { force: true });
    assert.equal(readFileSync(join(fork.dir, "body.md"), "utf8"), "Updated body v3.\n");
  });
});

test("ista skill delete deletes cleanly when nothing links to it", async () => {
  await withScopes(async (project) => {
    writeTestSkill(project, "code-review");
    await runSkillDelete(project, "code-review", { force: false, convertToForks: false });
    assert.equal(findSkillInScope(project, "code-review"), null);
  });
});

test("ista skill delete refuses when linked, and --force deletes leaving a dangling ref", async () => {
  await withScopes(async (project, userHome) => {
    const meta = writeTestSkill(userHome, "code-review");
    runLink(project, "code-review", "user", { category: "quality" });

    await runSkillDelete(userHome, "code-review", { force: false, convertToForks: false });
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
    assert.ok(findSkillInScope(userHome, "code-review")); // refused, still present

    await runSkillDelete(userHome, "code-review", { force: true, convertToForks: false });
    assert.equal(findSkillInScope(userHome, "code-review"), null);
    // the project's category ref is now dangling -- exactly what `ista scan` flags.
    assert.deepEqual(readCategoryIndex(project, "quality"), [{ ref: { scope: "user", id: meta.id } }]);
  });
});

test("ista skill delete --convert-to-forks turns the linker into an independent copy first", async () => {
  await withScopes(async (project, userHome) => {
    writeTestSkill(userHome, "code-review");
    runLink(project, "code-review", "user", { category: "quality" });

    await runSkillDelete(userHome, "code-review", { force: false, convertToForks: true });

    assert.equal(findSkillInScope(userHome, "code-review"), null);
    const forkedInProject = findSkillInScope(project, "code-review");
    assert.ok(forkedInProject);
    assert.deepEqual(readCategoryIndex(project, "quality"), ["code-review"]);
  });
});

test("ista skill delete --convert-to-forks aborts (without --force) when a conversion fails", async () => {
  await withScopes(async (project, userHome) => {
    const meta = writeTestSkill(userHome, "code-review");
    runLink(project, "code-review", "user", { category: "quality" });
    // Something already occupies the name the conversion would fork into --
    // e.g. the linker separately forked this skill earlier.
    writeTestSkill(project, "code-review");

    await runSkillDelete(userHome, "code-review", { force: false, convertToForks: true });
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;

    // Refused: the source skill must still exist, and the registry entry
    // must still record the (unconverted) link -- nothing was silently lost.
    assert.ok(findSkillInScope(userHome, "code-review"));
    assert.deepEqual(getRegistryEntry(userHome, meta.id).linked_by, [{ scope: "project", path: project }]);

    // The dangling link in the project's category index is untouched too.
    assert.deepEqual(readCategoryIndex(project, "quality"), [{ ref: { scope: "user", id: meta.id } }]);
  });
});
