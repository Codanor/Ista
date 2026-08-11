// The backlink registry (§9.6): lives at the scope a skill is linked/forked
// FROM, written transactionally as part of the same link/fork operation that
// creates the reference -- never reconstructed later by scanning arbitrary
// project directories (unreliable and slow).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import { z } from "zod";
import { RefScopeSchema } from "./schema.ts";
import { linkRegistryPath } from "./store.ts";

const BacklinkSchema = z.object({ scope: RefScopeSchema, path: z.string() });
const ForkedBySchema = z.object({ scope: RefScopeSchema, path: z.string(), id: z.string() });
const RegistryEntrySchema = z.object({
  linked_by: z.array(BacklinkSchema).default([]),
  forked_by: z.array(ForkedBySchema).default([]),
});
const LinkRegistrySchema = z.record(z.string(), RegistryEntrySchema);

export type Backlink = z.infer<typeof BacklinkSchema>;
export type ForkedByEntry = z.infer<typeof ForkedBySchema>;
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;
export type LinkRegistry = z.infer<typeof LinkRegistrySchema>;

const EMPTY_ENTRY: RegistryEntry = { linked_by: [], forked_by: [] };

export function readLinkRegistry(root: string): LinkRegistry {
  const p = linkRegistryPath(root);
  if (!existsSync(p)) return {};
  return LinkRegistrySchema.parse(yaml.load(readFileSync(p, "utf8")) ?? {});
}

export function writeLinkRegistry(root: string, registry: LinkRegistry): void {
  writeFileSync(linkRegistryPath(root), yaml.dump(registry), "utf8");
}

export function getRegistryEntry(root: string, skillId: string): RegistryEntry {
  return readLinkRegistry(root)[skillId] ?? EMPTY_ENTRY;
}

export function addLinkedBy(root: string, skillId: string, backlink: Backlink): void {
  const registry = readLinkRegistry(root);
  const entry = registry[skillId] ?? { linked_by: [], forked_by: [] };
  if (!entry.linked_by.some((b) => b.scope === backlink.scope && b.path === backlink.path)) {
    entry.linked_by.push(backlink);
  }
  registry[skillId] = entry;
  writeLinkRegistry(root, registry);
}

export function addForkedBy(root: string, skillId: string, forkedBy: ForkedByEntry): void {
  const registry = readLinkRegistry(root);
  const entry = registry[skillId] ?? { linked_by: [], forked_by: [] };
  if (!entry.forked_by.some((f) => f.scope === forkedBy.scope && f.path === forkedBy.path && f.id === forkedBy.id)) {
    entry.forked_by.push(forkedBy);
  }
  registry[skillId] = entry;
  writeLinkRegistry(root, registry);
}

// Used when `ista skill delete --convert-to-forks` turns a link into a fork:
// the dependent no longer just references this skill, so it drops out of
// linked_by (a matching forked_by entry is added separately, via addForkedBy).
export function removeLinkedBy(root: string, skillId: string, backlink: Backlink): void {
  const registry = readLinkRegistry(root);
  const entry = registry[skillId];
  if (!entry) return;
  entry.linked_by = entry.linked_by.filter((b) => !(b.scope === backlink.scope && b.path === backlink.path));
  registry[skillId] = entry;
  writeLinkRegistry(root, registry);
}

export function removeRegistryEntry(root: string, skillId: string): void {
  const registry = readLinkRegistry(root);
  if (!(skillId in registry)) return;
  delete registry[skillId];
  writeLinkRegistry(root, registry);
}
