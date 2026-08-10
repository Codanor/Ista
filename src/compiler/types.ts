// The compiler interface (§5.1 of ista-plan.md). Every system — first-party or
// custom — implements exactly this. Nothing outside the compiler boundary may
// special-case a specific system by name (§2, constraint #1).
import type { Capabilities, SkillMeta } from "../schema.ts";

export interface AttachmentContent {
  path: string;
  content: string;
}

// A skill.yaml fully resolved: attachments read off disk, capability defaults
// applied by the schema, ready to hand to a compiler.
export interface ResolvedSkill extends SkillMeta {
  dir: string; // absolute path to the skill's source directory
  bodyContent: string;
  attachmentContents: AttachmentContent[];
}

export interface CompileContext {
  projectRoot: string; // directory containing .ista/
  force: boolean; // skip manual-edit protection and overwrite
}

export interface CompileResult {
  filesWritten: string[];
  skipped: string[]; // targetPath entries not written because of a manual edit
  warnings: string[];
}

// A skill found in a native system format with no matching entry in the
// meta-schema store yet. Returned by `parse()`, consumed by `ista scan` (Phase 2).
export interface DetectedSkill {
  sourcePath: string;
  suggested: Partial<SkillMeta>;
}

export type EnforcementLevel = "enforce" | "advise" | "ignore";

export type CapabilityReport = {
  [K in keyof Capabilities]: EnforcementLevel;
};

export interface ValidationIssue {
  level: "warning" | "error";
  message: string;
}

export interface IstaCompiler {
  id: string;
  displayName: string;

  compile(skill: ResolvedSkill, ctx: CompileContext): CompileResult;

  // Reverse direction: scan a native-format location and return skills found
  // there that don't yet exist in the meta-schema store. Powers `ista scan`.
  // Unimplemented until Phase 2 — the method exists now so this interface
  // never has to change shape when it lands.
  parse(targetPath: string): DetectedSkill[];

  supports(): CapabilityReport;

  validate(skill: ResolvedSkill): ValidationIssue[];
}
