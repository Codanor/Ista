import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";
import { runPull } from "../src/commands/pull.ts";
import { runPush } from "../src/commands/push.ts";
import { runGit } from "../src/git.ts";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { initScope, skillsDir, writeSkill } from "../src/store.ts";

// All git activity here stays on the local filesystem -- the "remote" is a
// bare repo in a temp dir, never a real network host.
function initBareRemote(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const result = runGit(["init", "--bare", "-b", "main"], dir);
  assert.ok(result.ok, result.output);
}

function seedRemoteWithOneCommit(remote: string): void {
  const seed = mkdtempSync(join(tmpdir(), "ista-seed-"));
  try {
    initScope(seed);
    const meta = parseSkillMeta({ id: generateSkillId("shared"), name: "shared", description: "org skill" });
    writeSkill(join(skillsDir(seed), "shared"), meta);
    writeFileSync(join(skillsDir(seed), "shared", "body.md"), "Org body.\n", "utf8");

    assert.ok(runGit(["init", "-b", "main"], seed).ok);
    assert.ok(runGit(["add", "-A"], seed).ok);
    assert.ok(runGit(["commit", "-m", "seed"], seed).ok);
    assert.ok(runGit(["remote", "add", "origin", remote], seed).ok);
    const pushed = runGit(["push", "origin", "main"], seed);
    assert.ok(pushed.ok, pushed.output);
  } finally {
    rmSync(seed, { recursive: true, force: true });
  }
}

function writeOrgConfig(projectRoot: string, org: { path: string; remote?: string }): void {
  writeFileSync(join(projectRoot, ".ista", "ista.config.yaml"), yaml.dump({ systems: {}, org }), "utf8");
}

async function withGitFixture<T>(fn: (ctx: { remote: string; project: string; mirror: string }) => T | Promise<T>): Promise<T> {
  const remote = mkdtempSync(join(tmpdir(), "ista-remote-"));
  const project = mkdtempSync(join(tmpdir(), "ista-project-"));
  const mirror = join(tmpdir(), `ista-mirror-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  try {
    initBareRemote(remote);
    seedRemoteWithOneCommit(remote);
    initScope(project);
    writeOrgConfig(project, { path: mirror, remote });
    return await fn({ remote, project, mirror });
  } finally {
    rmSync(remote, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
    rmSync(mirror, { recursive: true, force: true });
    process.exitCode = 0;
  }
}

test("ista pull clones the org remote on first run", async () => {
  await withGitFixture(({ project, mirror }) => {
    runPull(project);
    assert.ok(existsSync(join(mirror, ".ista", "skills", "shared", "skill.yaml")));
  });
});

test("ista pull fast-forwards an existing local mirror", async () => {
  await withGitFixture(({ project, mirror }) => {
    runPull(project); // clone
    const before = runGit(["rev-parse", "HEAD"], mirror);
    runPull(project); // pull again, nothing new -- should be a no-op success
    assert.notEqual(process.exitCode, 1);
    const after = runGit(["rev-parse", "HEAD"], mirror);
    assert.equal(before.output, after.output);
  });
});

test("ista push publishes local org changes, and a fresh pull elsewhere sees them", async () => {
  await withGitFixture(async ({ remote, project, mirror }) => {
    runPull(project); // clone the mirror

    const meta = parseSkillMeta({ id: generateSkillId("new-skill"), name: "new-skill", description: "pushed later" });
    writeSkill(join(skillsDir(mirror), "new-skill"), meta);
    writeFileSync(join(skillsDir(mirror), "new-skill", "body.md"), "New body.\n", "utf8");

    runPush(project, {});

    const secondProject = mkdtempSync(join(tmpdir(), "ista-project2-"));
    const secondMirror = join(tmpdir(), `ista-mirror2-${Date.now()}`);
    try {
      initScope(secondProject);
      writeOrgConfig(secondProject, { path: secondMirror, remote });
      runPull(secondProject);
      assert.ok(existsSync(join(secondMirror, ".ista", "skills", "new-skill", "skill.yaml")));
    } finally {
      rmSync(secondProject, { recursive: true, force: true });
      rmSync(secondMirror, { recursive: true, force: true });
    }
  });
});

test("ista push with nothing to push says so and doesn't error", async () => {
  await withGitFixture(({ project }) => {
    runPull(project);
    runPush(project, {});
    assert.notEqual(process.exitCode, 1);
  });
});
