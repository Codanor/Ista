import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  addForkedBy,
  addLinkedBy,
  getRegistryEntry,
  removeLinkedBy,
  removeRegistryEntry,
} from "../src/linkRegistry.ts";
import { initScope } from "../src/store.ts";

function withRoot<T>(fn: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "ista-registry-"));
  try {
    initScope(root);
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("addLinkedBy dedupes and removeLinkedBy removes exactly one entry", () => {
  withRoot((root) => {
    addLinkedBy(root, "cr-1", { scope: "project", path: "/a" });
    addLinkedBy(root, "cr-1", { scope: "project", path: "/a" }); // duplicate
    addLinkedBy(root, "cr-1", { scope: "project", path: "/b" });

    assert.deepEqual(getRegistryEntry(root, "cr-1").linked_by, [
      { scope: "project", path: "/a" },
      { scope: "project", path: "/b" },
    ]);

    removeLinkedBy(root, "cr-1", { scope: "project", path: "/a" });
    assert.deepEqual(getRegistryEntry(root, "cr-1").linked_by, [{ scope: "project", path: "/b" }]);
  });
});

test("addForkedBy records lineage and getRegistryEntry defaults to empty", () => {
  withRoot((root) => {
    assert.deepEqual(getRegistryEntry(root, "unknown"), { linked_by: [], forked_by: [] });

    addForkedBy(root, "cr-1", { scope: "project", path: "/legacy", id: "cr-91b2d0" });
    assert.deepEqual(getRegistryEntry(root, "cr-1").forked_by, [
      { scope: "project", path: "/legacy", id: "cr-91b2d0" },
    ]);
  });
});

test("removeRegistryEntry drops the whole skill id", () => {
  withRoot((root) => {
    addLinkedBy(root, "cr-1", { scope: "project", path: "/a" });
    removeRegistryEntry(root, "cr-1");
    assert.deepEqual(getRegistryEntry(root, "cr-1"), { linked_by: [], forked_by: [] });
  });
});
