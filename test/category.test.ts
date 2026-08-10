import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  addToCategory,
  listCategories,
  readCategoryIndex,
  removeIdFromAllCategories,
  replaceRefInAllCategories,
} from "../src/category.ts";
import { runCategoryAdd } from "../src/commands/category.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, skillsDir, writeSkill } from "../src/store.ts";

function withRoot<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "ista-category-"));
  try {
    initScope(root);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("addToCategory writes and dedupes entries", () => {
  withRoot((root) => {
    addToCategory(root, "quality", "code-review");
    addToCategory(root, "quality", "code-review"); // duplicate, should no-op
    addToCategory(root, "quality", { ref: { scope: "user", id: "cr-1" } });

    const entries = readCategoryIndex(root, "quality");
    assert.deepEqual(entries, ["code-review", { ref: { scope: "user", id: "cr-1" } }]);
    assert.deepEqual(listCategories(root), ["quality"]);
  });
});

test("replaceRefInAllCategories swaps a cross-scope ref for a same-scope entry, only where it matches", () => {
  withRoot((root) => {
    addToCategory(root, "quality", { ref: { scope: "user", id: "cr-1" } });
    addToCategory(root, "dev-workflow", { ref: { scope: "user", id: "cr-1" } });
    addToCategory(root, "dev-workflow", { ref: { scope: "user", id: "other" } });

    const replaced = replaceRefInAllCategories(root, { scope: "user", id: "cr-1" }, "code-review");
    assert.equal(replaced, 2);
    assert.deepEqual(readCategoryIndex(root, "quality"), ["code-review"]);
    assert.deepEqual(readCategoryIndex(root, "dev-workflow"), ["code-review", { ref: { scope: "user", id: "other" } }]);
  });
});

test("removeIdFromAllCategories drops matching same-scope entries only", () => {
  withRoot((root) => {
    addToCategory(root, "quality", "code-review");
    addToCategory(root, "quality", "other-skill");

    removeIdFromAllCategories(root, "code-review");
    assert.deepEqual(readCategoryIndex(root, "quality"), ["other-skill"]);
  });
});

test("runCategoryAdd files a same-scope skill into a category by name", () => {
  withRoot((root) => {
    const meta = parseSkillMeta({ id: generateSkillId("code-review"), name: "code-review", description: "d" });
    writeSkill(join(skillsDir(root), "code-review"), meta);

    runCategoryAdd(root, "code-review", "quality");

    assert.deepEqual(readCategoryIndex(root, "quality"), ["code-review"]);
  });
});
