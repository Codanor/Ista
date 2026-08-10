import { isGitRepo, runGit } from "../git.ts";
import { findOrgConfig } from "../scope.ts";

// Publishes local org-scope changes (§7): only ever runs against the local
// mirror at org.path, which must already be a git repo (i.e. `ista pull` has
// run at least once) -- Ista never creates a remote repo on your behalf.
export function runPush(cwd: string, opts: { message?: string }): void {
  const org = findOrgConfig(cwd);
  if (!org) {
    console.error("No org scope configured -- set org.path (and org.remote) in ista.config.yaml.");
    process.exitCode = 1;
    return;
  }

  if (!isGitRepo(org.path)) {
    console.error(`${org.path} isn't a git repository yet -- run \`ista pull\` first.`);
    process.exitCode = 1;
    return;
  }

  const status = runGit(["status", "--porcelain"], org.path);
  if (!status.ok) {
    console.error(status.output);
    process.exitCode = 1;
    return;
  }
  if (status.output === "") {
    console.log("Nothing to push -- org scope has no local changes.");
    return;
  }

  const add = runGit(["add", "-A"], org.path);
  if (!add.ok) {
    console.error(add.output);
    process.exitCode = 1;
    return;
  }

  const message = opts.message ?? `ista push: ${new Date().toISOString()}`;
  const commit = runGit(["commit", "-m", message], org.path);
  if (!commit.ok) {
    console.error(commit.output);
    process.exitCode = 1;
    return;
  }

  const push = runGit(["push"], org.path);
  if (!push.ok) {
    console.error(`git push failed: ${push.output}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Pushed org scope changes from ${org.path}.`);
}
