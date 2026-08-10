// Fourth compiler, lowest priority (§5.3.4): no real filesystem or API sync
// target exists for a Custom GPT yet, so compile() output is copy-pasteable
// text rather than something automatically pushed anywhere.
import { join } from "node:path";
import { manualEditWarning, mirrorResources, parseSkillDirectory, skippedPath, writeFrontmatterFile } from "./sdk.ts";
import type {
  CapabilityReport,
  CompileContext,
  CompileResult,
  DetectedSkill,
  IstaCompiler,
  ResolvedSkill,
  ValidationIssue,
} from "./types.ts";

// Custom GPTs have no allowed-tools/policy/sandbox concept at all -- the
// closest thing to expressing capability intent is telling the author which
// built-in GPT features or Actions to turn on by hand.
function capabilityChecklist(skill: ResolvedSkill): string {
  const c = skill.capabilities;
  const lines: string[] = [];
  if (c.reads_files || c.writes_files) lines.push("- Enable Code Interpreter & Data Analysis for file access.");
  if (c.network) lines.push("- Enable web browsing, or add an Action, for live network access.");
  if (c.shell_exec) lines.push("- No Custom GPT feature maps to shell execution -- consider an Action backed by your own sandboxed API.");
  if (c.tools.length > 0) lines.push(`- Named tools requested (${c.tools.join(", ")}) -- configure matching Actions by hand.`);
  if (c.spawn_subagents) lines.push("- Subagent spawning has no Custom GPT equivalent; this intent can't be expressed here.");
  return lines.length > 0 ? lines.join("\n") : "- No capabilities requested.";
}

export const chatgptCompiler: IstaCompiler = {
  id: "chatgpt",
  displayName: "ChatGPT / Custom GPT",

  compile(skill: ResolvedSkill, ctx: CompileContext): CompileResult {
    const overrides = (skill.systems.chatgpt?.overrides ?? {}) as Record<string, unknown>;
    const frontmatter: Record<string, unknown> = { name: skill.name, description: skill.description, ...overrides };

    const body = [
      "> Copy everything under Instructions into your Custom GPT's Instructions field.",
      "> Nothing here syncs automatically -- ChatGPT has no local file or API target yet.",
      "",
      "## Manual capability checklist",
      capabilityChecklist(skill),
      "",
      "## Instructions",
      skill.bodyContent,
      ...skill.attachmentContents.map((a) => a.content),
    ].join("\n");

    const targetDir = join(ctx.projectRoot, ".chatgpt", "skills", skill.name);
    const targetPath = join(targetDir, "SKILL.md");
    const outcome = writeFrontmatterFile(ctx.projectRoot, targetPath, frontmatter, body, { force: ctx.force });

    const warnings = [manualEditWarning(targetPath, outcome)].filter((w): w is string => w !== null);
    const filesWritten = outcome.written ? [targetPath, ...mirrorResources(skill, targetDir)] : [];
    const skipped = [skippedPath(targetPath, outcome)].filter((p): p is string => p !== null);

    return { filesWritten, skipped, warnings };
  },

  parse(targetPath: string): DetectedSkill[] {
    return parseSkillDirectory(targetPath);
  },

  supports(): CapabilityReport {
    return {
      reads_files: "advise",
      writes_files: "advise",
      network: "advise",
      shell_exec: "advise",
      tools: "advise",
      // No Custom GPT concept represents subagent spawning, same reasoning
      // as Codex -- nothing to even suggest.
      spawn_subagents: "ignore",
      approval: "advise",
    };
  },

  validate(_skill: ResolvedSkill): ValidationIssue[] {
    return [];
  },
};
