import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import yaml from "js-yaml";
import { generateSkillId } from "../src/id.ts";
import { parseSkillMeta } from "../src/schema.ts";
import { currentScope, findSkillAcrossScopes, resolveScopeRoot } from "../src/scope.ts";
import { configPath, initScope, skillsDir, writeSkill } from "../src/store.ts";

function withUserHome<T>(fn: (userHome: string) => T): T {
  const userHome = mkdtempSync(join(tmpdir(), "ista-user-"));
  const previous = process.env.ISTA_HOME;
  process.env.ISTA_HOME = userHome;
  try {
    return fn(userHome);
  } finally {
    if (previous === undefined) delete process.env.ISTA_HOME;
    else process.env.ISTA_HOME = previous;
    rmSync(userHome, { recursive: true, force: true });
  }
}

test("currentScope falls back to user scope when no project .ista is found", () => {
  withUserHome((userHome) => {
    const noProject = mkdtempSync(join(tmpdir(), "ista-noproject-"));
    try {
      const result = currentScope(noProject);
      assert.equal(result.scope, "user");
      assert.equal(result.root, userHome);
    } finally {
      rmSync(noProject, { recursive: true, force: true });
    }
  });
});

test("currentScope prefers project scope when a .ista is found walking up", () => {
  withUserHome(() => {
    const project = mkdtempSync(join(tmpdir(), "ista-project-"));
    try {
      initScope(project);
      const nested = join(project, "a", "b");
      const result = currentScope(nested);
      assert.equal(result.scope, "project");
      assert.equal(result.root, project);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

test("currentScope recognizes cwd inside the configured org mirror as org scope, not project", () => {
  withUserHome((userHome) => {
    const orgMirror = mkdtempSync(join(tmpdir(), "ista-org-"));
    try {
      initScope(orgMirror);
      initScope(userHome);
      writeFileSync(
        configPath(userHome),
        yaml.dump({ systems: { claude: { enabled: true } }, org: { path: orgMirror } }),
        "utf8",
      );

      const result = currentScope(orgMirror);
      assert.equal(result.scope, "org");
      assert.equal(result.root, orgMirror);
    } finally {
      rmSync(orgMirror, { recursive: true, force: true });
    }
  });
});

test("resolveScopeRoot for org is null when unconfigured", () => {
  withUserHome(() => {
    const project = mkdtempSync(join(tmpdir(), "ista-project-"));
    try {
      initScope(project);
      assert.equal(resolveScopeRoot("org", project), null);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});

test("findSkillAcrossScopes resolves project before user (project shadows user)", () => {
  withUserHome((userHome) => {
    const project = mkdtempSync(join(tmpdir(), "ista-project-"));
    try {
      initScope(project);

      const userMeta = parseSkillMeta({ id: generateSkillId("shared"), name: "shared", description: "user copy" });
      writeSkill(join(skillsDir(userHome), "shared"), userMeta);

      const projectMeta = parseSkillMeta({ id: generateSkillId("shared"), name: "shared", description: "project copy" });
      writeSkill(join(skillsDir(project), "shared"), projectMeta);

      const found = findSkillAcrossScopes(project, "shared");
      assert.equal(found?.scope, "project");
      assert.equal(found?.meta.description, "project copy");
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
