import { chatgptCompiler } from "../compiler/chatgpt.ts";
import { claudeCompiler } from "../compiler/claude.ts";
import { codexCompiler } from "../compiler/codex.ts";
import { geminiCompiler } from "../compiler/gemini.ts";
import type { IstaCompiler } from "../compiler/types.ts";
import { loadCustomCompilers } from "../customSystem.ts";
import { activeCapabilities, isSystemAllowedByScope } from "../schema.ts";
import { currentScopeRoot } from "../scope.ts";
import { listSkills, readConfig, resolveSkill } from "../store.ts";

export const BUILTIN_COMPILERS: Record<string, IstaCompiler> = {
  claude: claudeCompiler,
  gemini: geminiCompiler,
  codex: codexCompiler,
  chatgpt: chatgptCompiler,
};

// Custom systems (§6) registered at `root` merge on top of the first-party
// ones -- nothing here special-cases a system by name outside this boundary,
// and a custom system can even override a built-in id if someone wants that.
export async function resolveCompilers(root: string): Promise<{ compilers: Record<string, IstaCompiler>; errors: string[] }> {
  const { compilers: custom, errors } = await loadCustomCompilers(root);
  return { compilers: { ...BUILTIN_COMPILERS, ...custom }, errors };
}

export async function runSync(cwd: string, opts: { force: boolean }): Promise<void> {
  const root = currentScopeRoot(cwd);
  const config = readConfig(root);
  const { compilers: COMPILERS, errors } = await resolveCompilers(root);
  for (const err of errors) console.log(`[warn] ${err}`);

  const skills = listSkills(root);
  if (skills.length === 0) {
    console.log("No skills to sync.");
    return;
  }

  let systemsCompiledTo = 0;
  let warningCount = errors.length;

  for (const { dir, meta } of skills) {
    const resolved = resolveSkill(dir, meta);
    // A skill enables a system for itself; the scope config can still veto it
    // scope-wide (§7 -- "a project may enable a subset of the systems enabled
    // globally"). Missing from scope config = allowed by default.
    const systemIds = Object.entries(resolved.systems)
      .filter(([id, cfg]) => cfg.enabled && isSystemAllowedByScope(config, id))
      .map(([id]) => id);

    for (const systemId of systemIds) {
      const compiler = COMPILERS[systemId];
      if (!compiler) {
        console.log(`[warn] ${meta.name}: no compiler registered for system "${systemId}", skipping`);
        warningCount++;
        continue;
      }

      for (const issue of compiler.validate(resolved)) {
        console.log(`[${issue.level}] ${meta.name} (${systemId}): ${issue.message}`);
        warningCount++;
      }

      // Capability honesty (§2, constraint 2): for every capability this
      // skill actually requests, say plainly whether this system can
      // structurally enforce it, only advise, or has to ignore it entirely.
      const report = compiler.supports();
      for (const key of activeCapabilities(resolved.capabilities)) {
        const level = report[key];
        if (level !== "enforce") {
          console.log(`[${level}] ${meta.name} (${systemId}): capabilities.${key} is only "${level}" on ${compiler.displayName}`);
          warningCount++;
        }
      }

      const result = compiler.compile(resolved, { projectRoot: root, force: opts.force });
      systemsCompiledTo++;
      for (const w of result.warnings) {
        console.log(`${meta.name} (${systemId}): ${w}`);
        warningCount++;
      }
      for (const f of result.filesWritten) console.log(`  wrote ${f}`);
      for (const s of result.skipped) console.log(`  skipped ${s}`);
    }
  }

  console.log(
    `\nSynced ${skills.length} skill(s) to ${systemsCompiledTo} system target(s), ${warningCount} warning(s).`,
  );
}
