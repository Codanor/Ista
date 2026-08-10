// Thin wrapper around the system `git` binary. No JS git library dependency:
// git itself is already installed on essentially every dev machine that
// would use a CLI tool like this, and shelling out to the real thing avoids
// reimplementing (or half-reimplementing) git plumbing.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface GitResult {
  ok: boolean;
  output: string;
}

export function runGit(args: string[], cwd: string): GitResult {
  try {
    const output = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output: output.trim() };
  } catch (err) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    const output = [e.stdout, e.stderr].filter(Boolean).map(String).join("\n").trim() || e.message;
    return { ok: false, output };
  }
}

export function isGitRepo(dir: string): boolean {
  return existsSync(dir) && runGit(["rev-parse", "--is-inside-work-tree"], dir).ok;
}
