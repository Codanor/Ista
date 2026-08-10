import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readCategoryIndex } from "../src/category.ts";
import { generateSkillId } from "../src/id.ts";
import { computeContentHash, forkSkill, writeLink } from "../src/linking.ts";
import { getRegistryEntry } from "../src/linkRegistry.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, resolveSkill, skillsDir, writeSkill } from "../src/store.ts";

function makeTwoScopes() {
  const source = mkdtempSync(join(tmpdir(), "ista-source-"));
  const dest = mkdtempSync(join(tmpdir(), "ista-dest-"));
  initScope(source);
  initScope(dest);
  const meta = parseSkillMeta({
    id: generateSkillId("code-review"),
    name: "code-review",
    description: "Reviews code changes",
    capabilities: { shell_exec: true },
  });
  const dir = join(skillsDir(source), "code-review");
  writeSkill(dir, meta);
  writeFileSync(join(dir, "body.md"), "Body content.\n", "utf8");
  return { source, dest, meta, dir };
}

function cleanup(...roots: string[]) {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

test("forkSkill copies content, assigns a new id, and records a matching content_hash", () => {
  const { source, dest, meta, dir } = makeTwoScopes();
  try {
    const result = forkSkill("project", dir, meta, dest, "project");
    assert.ok(result.ok);
    if (!result.ok) return;

    assert.notEqual(result.meta.id, meta.id);
    assert.equal(result.meta.forked_from?.scope, "project");
    assert.equal(result.meta.forked_from?.id, meta.id);

    const forkedResolved = resolveSkill(result.dir, result.meta);
    assert.equal(computeContentHash(forkedResolved), result.meta.forked_from?.content_hash);
    assert.equal(readFileSync(join(result.dir, "body.md"), "utf8"), "Body content.\n");
  } finally {
    cleanup(source, dest);
  }
});

test("forkSkill refuses to overwrite an existing same-name skill at the destination", () => {
  const { source, dest, meta, dir } = makeTwoScopes();
  try {
    writeSkill(join(skillsDir(dest), "code-review"), meta);
    const result = forkSkill("project", dir, meta, dest, "project");
    assert.equal(result.ok, false);
  } finally {
    cleanup(source, dest);
  }
});

test("writeLink adds a category ref at dest and a linked_by backlink at source", () => {
  const { source, dest, meta } = makeTwoScopes();
  try {
    writeLink(source, "project", meta.id, dest, "project", "quality");

    assert.deepEqual(readCategoryIndex(dest, "quality"), [{ ref: { scope: "project", id: meta.id } }]);
    assert.deepEqual(getRegistryEntry(source, meta.id).linked_by, [{ scope: "project", path: dest }]);
  } finally {
    cleanup(source, dest);
  }
});
