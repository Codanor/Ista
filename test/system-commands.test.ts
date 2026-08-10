import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";
import { runSystemAdd, runSystemList, runSystemRemove, runSystemScaffold } from "../src/commands/system.ts";
import { loadCustomCompiler, readSystemRegistry, SystemManifestSchema } from "../src/customSystem.ts";
import { initScope } from "../src/store.ts";

async function withProject<T>(fn: (project: string) => T | Promise<T>): Promise<T> {
  const project = mkdtempSync(join(tmpdir(), "ista-systemcmd-"));
  try {
    initScope(project);
    return await fn(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
    process.exitCode = 0;
  }
}

test("scaffold -> add -> load: the generated stub is a real, loadable compiler", async () => {
  await withProject(async (project) => {
    runSystemScaffold(project, "mytool");

    const scaffoldDir = join(project, "ista-compiler-mytool");
    const manifestRaw = yaml.load(readFileSync(join(scaffoldDir, "ista-system.yaml"), "utf8"));
    const manifest = SystemManifestSchema.parse(manifestRaw);
    assert.equal(manifest.id, "mytool");
    assert.equal(manifest.compilerEntrypoint, "./compiler.js");

    runSystemAdd(project, "mytool", scaffoldDir);
    const registry = readSystemRegistry(project);
    assert.ok(registry.mytool);
    assert.equal(registry.mytool!.compilerEntrypoint, join(scaffoldDir, "compiler.js"));

    const loaded = await loadCustomCompiler(project, registry.mytool!.compilerEntrypoint);
    assert.ok(loaded.ok);
    if (loaded.ok) {
      assert.equal(loaded.compiler.id, "mytool");
      const result = loaded.compiler.compile({} as never, {} as never);
      assert.match(result.warnings[0]!, /not implemented yet/);
    }
  });
});

test("system list / remove", async () => {
  await withProject(async (project) => {
    runSystemScaffold(project, "mytool");
    runSystemAdd(project, "mytool", join(project, "ista-compiler-mytool"));

    runSystemList(project); // just exercises the path, output isn't captured here

    runSystemRemove(project, "mytool");
    assert.deepEqual(readSystemRegistry(project), {});

    runSystemRemove(project, "mytool"); // removing again should error, not throw
    assert.equal(process.exitCode, 1);
  });
});
