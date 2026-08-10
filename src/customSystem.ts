// Custom/pluggable systems (§6): a system is a compiler package plus a small
// manifest. Registering one just records where to find it; the compiler
// itself is loaded lazily (dynamic import) at sync/scan time, so nothing in
// core Ista special-cases a system by name outside this loading boundary.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import type { IstaCompiler } from "./compiler/types.ts";
import { istaDir } from "./store.ts";

export const SystemManifestSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
  defaultTargetPath: z.string().default(""),
  // A resolved absolute path (local systems) or "npm:<package>" (published
  // systems, resolved from the registering scope's own node_modules).
  compilerEntrypoint: z.string().min(1),
});
export type SystemManifest = z.infer<typeof SystemManifestSchema>;

const SystemRegistrySchema = z.record(z.string(), SystemManifestSchema);
export type SystemRegistry = z.infer<typeof SystemRegistrySchema>;

export function systemsRegistryPath(root: string): string {
  return join(istaDir(root), "systems.yaml");
}

export function readSystemRegistry(root: string): SystemRegistry {
  const p = systemsRegistryPath(root);
  if (!existsSync(p)) return {};
  return SystemRegistrySchema.parse(yaml.load(readFileSync(p, "utf8")) ?? {});
}

export function writeSystemRegistry(root: string, registry: SystemRegistry): void {
  writeFileSync(systemsRegistryPath(root), yaml.dump(registry), "utf8");
}

function resolveEntrypointPath(scopeRoot: string, entrypoint: string): string {
  if (!entrypoint.startsWith("npm:")) return entrypoint; // already absolute, resolved at `system add` time
  const pkg = entrypoint.slice("npm:".length);
  // Resolves `pkg` as if requiring it from inside scopeRoot -- walks up
  // scopeRoot/node_modules the same way Node's own resolution would, no
  // package.json required at scopeRoot itself.
  const require = createRequire(join(scopeRoot, "package.json"));
  return require.resolve(pkg);
}

function describeShapeIssue(candidate: unknown): string | null {
  if (typeof candidate !== "object" || candidate === null) return "default export is not an object";
  const c = candidate as Record<string, unknown>;
  if (typeof c.id !== "string") return "missing string `id`";
  if (typeof c.displayName !== "string") return "missing string `displayName`";
  for (const method of ["compile", "parse", "supports", "validate"]) {
    if (typeof c[method] !== "function") return `missing function \`${method}\``;
  }
  return null;
}

export type LoadResult = { ok: true; compiler: IstaCompiler } | { ok: false; error: string };

export async function loadCustomCompiler(scopeRoot: string, entrypoint: string): Promise<LoadResult> {
  let resolvedPath: string;
  try {
    resolvedPath = resolveEntrypointPath(scopeRoot, entrypoint);
  } catch (err) {
    return { ok: false, error: `could not resolve entrypoint "${entrypoint}": ${(err as Error).message}` };
  }

  let mod: unknown;
  try {
    mod = await import(pathToFileURL(resolvedPath).href);
  } catch (err) {
    return { ok: false, error: `failed to load "${resolvedPath}": ${(err as Error).message}` };
  }

  const candidate = (mod as { default?: unknown }).default ?? mod;
  const issue = describeShapeIssue(candidate);
  if (issue) return { ok: false, error: `"${entrypoint}" doesn't implement the compiler interface (${issue})` };

  return { ok: true, compiler: candidate as IstaCompiler };
}

// Loads every system registered at `root`, merging into whatever first-party
// compilers the caller already has. Load failures are collected as messages
// rather than thrown, so one broken custom compiler doesn't take down sync
// for every other skill/system.
export async function loadCustomCompilers(root: string): Promise<{ compilers: Record<string, IstaCompiler>; errors: string[] }> {
  const registry = readSystemRegistry(root);
  const compilers: Record<string, IstaCompiler> = {};
  const errors: string[] = [];
  for (const [id, manifest] of Object.entries(registry)) {
    const result = await loadCustomCompiler(root, manifest.compilerEntrypoint);
    if (result.ok) compilers[id] = result.compiler;
    else errors.push(`system "${id}": ${result.error}`);
  }
  return { compilers, errors };
}
