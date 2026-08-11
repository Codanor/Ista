// Zod schema for skill.yaml — the single source of truth for the meta-schema (§4 of ista-plan.md).
// Native per-system files are compiled *from* this; never the other way around.
import { z } from "zod";

export const ApprovalSchema = z.enum(["required", "auto", "inherit"]);
export type Approval = z.infer<typeof ApprovalSchema>;

export const ScopeSchema = z.enum(["project", "user", "org"]);
export type Scope = z.infer<typeof ScopeSchema>;

// Where a *reference* (category ref, backlink, fork lineage) points: one of
// the three named scopes, or an arbitrary external project directory. "path"
// is never a skill's own home scope (that's always ScopeSchema) -- it only
// ever describes the far end of a link/fork made by pointing at another
// project's .ista/ directly, without routing through a shared org mirror.
export const RefScopeSchema = z.union([ScopeSchema, z.literal("path")]);
export type RefScope = z.infer<typeof RefScopeSchema>;

export const TriggerSchema = z.object({
  keywords: z.array(z.string()).default([]),
  always_on: z.boolean().default(false),
});
export type Trigger = z.infer<typeof TriggerSchema>;

export const CapabilitiesSchema = z.object({
  reads_files: z.boolean().default(false),
  writes_files: z.boolean().default(false),
  network: z.boolean().default(false),
  shell_exec: z.boolean().default(false),
  tools: z.array(z.string()).default([]),
  spawn_subagents: z.boolean().default(false),
  approval: ApprovalSchema.default("required"),
});
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

// Per-system targeting block. `overrides` is an intentional escape hatch for
// native-only fields that don't (and shouldn't) generalize across systems (§4).
export const SystemConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.string().optional(),
  overrides: z.record(z.string(), z.unknown()).default({}),
});
export type SystemConfig = z.infer<typeof SystemConfigSchema>;

export const ForkedFromSchema = z.object({
  scope: RefScopeSchema,
  path: z.string().optional(), // set when scope === "path"
  id: z.string(),
  version: z.string(),
  // Hash of the fork's content at fork/update time. `ista update` (§9.5)
  // recomputes this over the fork's *current* content: a match means nothing
  // has been hand-edited since, so the new truth can be fast-forwarded in
  // without a diff/confirm step.
  content_hash: z.string(),
});
export type ForkedFrom = z.infer<typeof ForkedFromSchema>;

export const SkillMetaSchema = z.object({
  // identity
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().default("0.1.0"),

  // activation
  trigger: TriggerSchema.default({}),

  // scope / priority
  scope: ScopeSchema.default("project"),
  priority: z.number().default(0),

  // capability intent
  capabilities: CapabilitiesSchema.default({}),

  // content
  body: z.string().default("body.md"),
  attachments: z.array(z.string()).default([]),
  resources: z.array(z.string()).default([]),
  scripts: z.array(z.string()).default([]),

  // per-system targeting
  systems: z.record(z.string(), SystemConfigSchema).default({}),

  // lineage — present only on forked skills (§9.4)
  forked_from: ForkedFromSchema.optional(),
});
export type SkillMeta = z.infer<typeof SkillMetaSchema>;

export function parseSkillMeta(raw: unknown): SkillMeta {
  return SkillMetaSchema.parse(raw);
}

// Which capability keys this skill is actually asking for right now — the
// input to the "surface CapabilityReport in ista sync" honesty check (§2,
// constraint 2): only warn about capabilities actually in use.
export function activeCapabilities(capabilities: Capabilities): (keyof Capabilities)[] {
  const active: (keyof Capabilities)[] = [];
  if (capabilities.reads_files) active.push("reads_files");
  if (capabilities.writes_files) active.push("writes_files");
  if (capabilities.network) active.push("network");
  if (capabilities.shell_exec) active.push("shell_exec");
  if (capabilities.tools.length > 0) active.push("tools");
  if (capabilities.spawn_subagents) active.push("spawn_subagents");
  if (capabilities.approval !== "inherit") active.push("approval");
  return active;
}

// ista.config.yaml — scope-wide config (§3): which systems this scope allows
// at all, and where its org remote lives. `systems` is a DENYLIST: a system
// missing from it is allowed by default (matches per-skill systems.*.enabled
// semantics, and means enabling a new compiler doesn't require touching every
// scope's config too) — only an explicit `enabled: false` turns one off.
export const IstaConfigSchema = z.object({
  systems: z.record(z.string(), z.object({ enabled: z.boolean().default(true) })).default({}),
  // Org scope's canonical copy lives at `remote` (a git URL); `path` is where
  // it's mirrored locally. `ista pull` clones/fast-forwards path from remote;
  // `ista push` commits+pushes local changes at path back to remote.
  org: z.object({ path: z.string(), remote: z.string().optional() }).optional(),
});
export type IstaConfig = z.infer<typeof IstaConfigSchema>;

export function parseIstaConfig(raw: unknown): IstaConfig {
  return IstaConfigSchema.parse(raw ?? {});
}

export function isSystemAllowedByScope(config: IstaConfig, systemId: string): boolean {
  return config.systems[systemId]?.enabled !== false;
}
