// Categories (§8) are a pure index/reference layer: skills live in exactly
// one flat store, categories only ever point at them. A cross-scope link
// (§9.2) is nothing more than a category-index entry whose ref.scope differs
// from the local scope -- no separate linking subsystem needed.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { ScopeSchema } from "./schema.ts";
import { categoriesDir } from "./store.ts";

const CategoryRefSchema = z.object({ ref: z.object({ scope: ScopeSchema, id: z.string() }) });
const CategoryEntrySchema = z.union([z.string(), CategoryRefSchema]);
const CategoryIndexSchema = z.array(CategoryEntrySchema);

export type CategoryEntry = z.infer<typeof CategoryEntrySchema>;
export type CategoryRef = z.infer<typeof CategoryRefSchema>;

export function categoryIndexPath(root: string, name: string): string {
  return join(categoriesDir(root), name, "index.yaml");
}

export function listCategories(root: string): string[] {
  const base = categoriesDir(root);
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(categoryIndexPath(root, e.name)))
    .map((e) => e.name);
}

export function readCategoryIndex(root: string, name: string): CategoryEntry[] {
  const p = categoryIndexPath(root, name);
  if (!existsSync(p)) return [];
  return CategoryIndexSchema.parse(yaml.load(readFileSync(p, "utf8")) ?? []);
}

export function writeCategoryIndex(root: string, name: string, entries: CategoryEntry[]): void {
  const p = categoryIndexPath(root, name);
  mkdirSync(join(categoriesDir(root), name), { recursive: true });
  writeFileSync(p, yaml.dump(entries), "utf8");
}

function entryEquals(a: CategoryEntry, b: CategoryEntry): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return a.ref.scope === b.ref.scope && a.ref.id === b.ref.id;
}

export function addToCategory(root: string, name: string, entry: CategoryEntry): void {
  const entries = readCategoryIndex(root, name);
  if (entries.some((e) => entryEquals(e, entry))) return;
  writeCategoryIndex(root, name, [...entries, entry]);
}

// Used by `ista skill delete --convert-to-forks` (§9.6): swap every ref
// entry pointing at `oldRef` for a plain same-scope id, across every
// category in this scope, now that a real local copy exists.
export function replaceRefInAllCategories(root: string, oldRef: { scope: string; id: string }, newEntry: string): number {
  let totalReplaced = 0;
  for (const name of listCategories(root)) {
    const entries = readCategoryIndex(root, name);
    let changedHere = false;
    const next = entries.map((e) => {
      if (typeof e !== "string" && e.ref.scope === oldRef.scope && e.ref.id === oldRef.id) {
        changedHere = true;
        totalReplaced++;
        return newEntry;
      }
      return e;
    });
    if (changedHere) writeCategoryIndex(root, name, next);
  }
  return totalReplaced;
}

// Same-scope cleanup for `ista skill delete`: drop any plain-id entries
// pointing at a skill that no longer exists in this scope's own store.
export function removeIdFromAllCategories(root: string, id: string): void {
  for (const name of listCategories(root)) {
    const entries = readCategoryIndex(root, name);
    const next = entries.filter((e) => e !== id);
    if (next.length !== entries.length) writeCategoryIndex(root, name, next);
  }
}
