// Third compiler (§5.3.3) — stress-tests the "advise-only" path. Codex has no
// skill-scoped permission mechanism at all: approval policy and sandbox mode
// live one layer up, at the session/sandbox level, independent of which skill
// is active. compile() can therefore only ever emit a config.toml *suggestion*
// the user applies manually to their own session config — never write it for
// real, since Ista does not own that file and it isn't scoped to this skill.
import { join } from "node:path";
import {
  manualEditWarning,
  mirrorResources,
  skippedPath,
  warn,
  writeFrontmatterFile,
  writeManagedFile,
  parseSkillDirectory,
} from "./sdk.ts";
import type { Approval } from "../schema.ts";
import type {
  CapabilityReport,
  CompileContext,
  CompileResult,
  DetectedSkill,
  IstaCompiler,
  ResolvedSkill,
  ValidationIssue,
} from "./types.ts";

function approvalPolicy(approval: Approval): string | null {
  if (approval === "required") return "on-request";
  if (approval === "auto") return "never";
  return null; // inherit -> no suggestion, defer to whatever the user already has
}

function suggestedConfigToml(skill: ResolvedSkill): string {
  const c = skill.capabilities;
  const policy = approvalPolicy(c.approval);
  const lines = [
    `# Suggested Codex session/sandbox profile for skill '${skill.name}' (${skill.id}).`,
    `# Codex has no skill-scoped permissions -- this is NOT applied automatically.`,
    `# Copy what you want into your own config.toml or a /permissions profile.`,
    ``,
    `[sandbox]`,
    `network_access = ${c.network}`,
    `writable_roots = [${c.writes_files ? '"."' : ""}]`,
  ];
  if (policy) lines.push(``, `[approval]`, `policy = "${policy}"  # from capabilities.approval="${c.approval}"`);
  lines.push("");
  return lines.join("\n");
}

export const codexCompiler: IstaCompiler = {
  id: "codex",
  displayName: "OpenAI Codex CLI",

  compile(skill: ResolvedSkill, ctx: CompileContext): CompileResult {
    const overrides = (skill.systems.codex?.overrides ?? {}) as Record<string, unknown>;
    const frontmatter: Record<string, unknown> = { name: skill.name, description: skill.description, ...overrides };
    const body = [skill.bodyContent, ...skill.attachmentContents.map((a) => a.content)].join("\n\n");

    const targetDir = join(ctx.projectRoot, ".codex", "skills", skill.name);
    const skillPath = join(targetDir, "SKILL.md");
    const configPath = join(targetDir, "suggested-config.toml");

    const skillOutcome = writeFrontmatterFile(ctx.projectRoot, skillPath, frontmatter, body, { force: ctx.force });
    const configOutcome = writeManagedFile(ctx.projectRoot, configPath, suggestedConfigToml(skill), {
      force: ctx.force,
    });

    const warnings = [manualEditWarning(skillPath, skillOutcome), manualEditWarning(configPath, configOutcome)].filter(
      (w): w is string => w !== null,
    );
    // The one warning every Codex compile gets, regardless of which capabilities
    // are in use — this system structurally cannot enforce any of them.
    warnings.push(
      warn(
        `Codex has no skill-scoped permission mechanism -- capability intent for "${skill.name}" is not enforced. ` +
          `See ${configPath} for a config.toml snippet to apply manually if you want it to shape this session.`,
      ),
    );

    const filesWritten: string[] = [];
    if (skillOutcome.written) filesWritten.push(skillPath, ...mirrorResources(skill, targetDir));
    if (configOutcome.written) filesWritten.push(configPath);

    const skipped = [skippedPath(skillPath, skillOutcome), skippedPath(configPath, configOutcome)].filter(
      (p): p is string => p !== null,
    );

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
      // No config.toml concept represents subagent spawning at all, and Ista
      // never orchestrates subagents itself (§2, constraint 4) -- there's
      // nothing to even suggest.
      spawn_subagents: "ignore",
      approval: "advise",
    };
  },

  validate(skill: ResolvedSkill): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const risky = skill.capabilities.shell_exec || skill.capabilities.writes_files || skill.capabilities.network;
    if (skill.capabilities.approval === "auto" && risky) {
      issues.push({
        level: "warning",
        message:
          `capabilities.approval="auto" combined with shell_exec/writes_files/network has no enforcement on ` +
          `Codex -- it is trusted entirely to your session/sandbox config, not this skill.`,
      });
    }
    return issues;
  },
};
