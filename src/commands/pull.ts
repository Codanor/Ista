import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { isGitRepo, runGit } from "../git.ts";
import { findOrgConfig } from "../scope.ts";

// Syncs the local org-scope mirror (§7) from its git remote: clones it on
// first use, fast-forwards it on every run after. --ff-only refuses to
// silently merge/rebase a local mirror that's diverged (it shouldn't have --
// org scope is read-mostly, meant to only be advanced by `ista push`).
export function runPull(cwd: string): void {
  const org = findOrgConfig(cwd);
  if (!org) {
    console.error("No org scope configured -- set org.path (and org.remote) in ista.config.yaml.");
    process.exitCode = 1;
    return;
  }

  if (!existsSync(org.path)) {
    if (!org.remote) {
      console.error(`org.path (${org.path}) doesn't exist and no org.remote is configured to clone it from.`);
      process.exitCode = 1;
      return;
    }
    mkdirSync(dirname(org.path), { recursive: true });
    const result = runGit(["clone", org.remote, org.path], dirname(org.path));
    if (!result.ok) {
      console.error(`git clone failed: ${result.output}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Cloned org scope from ${org.remote} into ${org.path}.`);
    return;
  }

  if (!isGitRepo(org.path)) {
    console.error(`${org.path} exists but isn't a git repository -- can't pull.`);
    process.exitCode = 1;
    return;
  }

  const result = runGit(["pull", "--ff-only"], org.path);
  if (!result.ok) {
    console.error(`git pull failed: ${result.output}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Pulled org scope at ${org.path}:\n${result.output}`);
}
