// Reference compiler implementation (§5.3.1) — targets Claude Code's project-scoped
// skill convention: .claude/skills/<name>/SKILL.md (+ references/, scripts/).
import { join } from "node:path";
import {
  manualEditWarning,
  mapCapabilities,
  mirrorResources,
  parseSkillDirectory,
  skippedPath,
  writeFrontmatterFile,
} from "./sdk.ts";
import type {
  CapabilityReport,
  CompileContext,
  CompileResult,
  DetectedSkill,
  IstaCompiler,
  ResolvedSkill,
  ValidationIssue,
} from "./types.ts";
import type { CapabilityMappingTable } from "./sdk.ts";

// The boring 1:1 part of the capability->allowed-tools translation.
const CAPABILITY_MAP: CapabilityMappingTable = {
  reads_files: ["Read", "Glob", "Grep"],
  writes_files: ["Write", "Edit"],
  network: ["WebFetch", "WebSearch"],
  shell_exec: ["Bash"],
  spawn_subagents: ["Agent"],
};

export const claudeCompiler: IstaCompiler = {
  id: "claude",
  displayName: "Claude Code",

  compile(skill: ResolvedSkill, ctx: CompileContext): CompileResult {
    const allowedTools = new Set(mapCapabilities(skill.capabilities, CAPABILITY_MAP));
    // tools+shell_exec is cross-field logic the generic mapper can't express:
    // named tools only mean anything once Bash itself is allowed.
    if (skill.capabilities.shell_exec) {
      for (const tool of skill.capabilities.tools) allowedTools.add(`Bash(${tool}:*)`);
    }

    const overrides = (skill.systems.claude?.overrides ?? {}) as Record<string, unknown>;
    const frontmatter: Record<string, unknown> = {
      name: skill.name,
      description: skill.description,
      ...(allowedTools.size > 0 ? { "allowed-tools": [...allowedTools] } : {}),
      ...overrides,
    };

    const body = [skill.bodyContent, ...skill.attachmentContents.map((a) => a.content)].join("\n\n");

    const targetDir = join(ctx.projectRoot, ".claude", "skills", skill.name);
    const targetPath = join(targetDir, "SKILL.md");
    const outcome = writeFrontmatterFile(ctx.projectRoot, targetPath, frontmatter, body, {
      force: ctx.force,
    });

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
      reads_files: "enforce",
      writes_files: "enforce",
      network: "enforce",
      shell_exec: "enforce",
      tools: "enforce",
      spawn_subagents: "enforce",
      // No required/auto/inherit equivalent exists in Claude's frontmatter —
      // only the unrelated disable-model-invocation escape hatch.
      approval: "advise",
    };
  },

  validate(skill: ResolvedSkill): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (skill.capabilities.tools.length > 0 && !skill.capabilities.shell_exec) {
      issues.push({
        level: "warning",
        message: `capabilities.tools is set but shell_exec is false; those tools won't appear in allowed-tools.`,
      });
    }
    return issues;
  },
};
