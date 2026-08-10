import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  loadCustomCompiler,
  loadCustomCompilers,
  readSystemRegistry,
  writeSystemRegistry,
} from "../src/customSystem.ts";
import { initScope } from "../src/store.ts";

// `fn` is always awaited *before* cleanup runs -- see test/commands.test.ts
// for why this matters (a sync-looking withX helper silently races async
// callbacks against its own finally-block cleanup otherwise).
async function withRoot<T>(fn: (root: string) => T | Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ista-customsystem-"));
  try {
    initScope(root);
    return await fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const GOOD_COMPILER = `
export default {
  id: "mytool",
  displayName: "My Tool",
  compile(skill, ctx) { return { filesWritten: [], skipped: [], warnings: [] }; },
  parse(targetPath) { return []; },
  supports() { return { reads_files: "ignore", writes_files: "ignore", network: "ignore", shell_exec: "ignore", tools: "ignore", spawn_subagents: "ignore", approval: "ignore" }; },
  validate(skill) { return []; },
};
`;

const BROKEN_COMPILER = `export default { id: "broken" };`; // missing displayName + methods

test("readSystemRegistry/writeSystemRegistry round-trips", async () => {
  await withRoot((root) => {
    assert.deepEqual(readSystemRegistry(root), {});
    writeSystemRegistry(root, {
      mytool: {
        id: "mytool",
        displayName: "My Tool",
        description: "desc",
        defaultTargetPath: ".mytool/skills/",
        compilerEntrypoint: "/abs/compiler.js",
      },
    });
    const registry = readSystemRegistry(root);
    assert.equal(registry.mytool?.displayName, "My Tool");
  });
});

test("loadCustomCompiler loads a well-formed compiler module", async () => {
  await withRoot(async (root) => {
    writeFileSync(join(root, "compiler.mjs"), GOOD_COMPILER, "utf8");
    const result = await loadCustomCompiler(root, join(root, "compiler.mjs"));
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.compiler.id, "mytool");
      assert.deepEqual(result.compiler.compile({} as never, {} as never), {
        filesWritten: [],
        skipped: [],
        warnings: [],
      });
    }
  });
});

test("loadCustomCompiler reports a clear error for a module missing required methods", async () => {
  await withRoot(async (root) => {
    writeFileSync(join(root, "broken.mjs"), BROKEN_COMPILER, "utf8");
    const result = await loadCustomCompiler(root, join(root, "broken.mjs"));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /missing string `displayName`|missing function/);
  });
});

test("loadCustomCompiler reports a clear error for a nonexistent entrypoint", async () => {
  await withRoot(async (root) => {
    const result = await loadCustomCompiler(root, join(root, "does-not-exist.mjs"));
    assert.equal(result.ok, false);
  });
});

test("loadCustomCompilers merges good systems and collects errors for broken ones", async () => {
  await withRoot(async (root) => {
    writeFileSync(join(root, "good.mjs"), GOOD_COMPILER, "utf8");
    writeFileSync(join(root, "broken.mjs"), BROKEN_COMPILER, "utf8");
    writeSystemRegistry(root, {
      mytool: {
        id: "mytool",
        displayName: "My Tool",
        description: "desc",
        defaultTargetPath: "",
        compilerEntrypoint: join(root, "good.mjs"),
      },
      broken: {
        id: "broken",
        displayName: "Broken",
        description: "desc",
        defaultTargetPath: "",
        compilerEntrypoint: join(root, "broken.mjs"),
      },
    });

    const { compilers, errors } = await loadCustomCompilers(root);
    assert.ok(compilers.mytool);
    assert.equal(compilers.broken, undefined);
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /system "broken"/);
  });
});
