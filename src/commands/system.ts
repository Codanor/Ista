import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { readSystemRegistry, SystemManifestSchema, writeSystemRegistry, type SystemManifest } from "../customSystem.ts";
import { currentScope } from "../scope.ts";

export function runSystemAdd(cwd: string, id: string, from: string): void {
  const { root } = currentScope(cwd);
  const registry = readSystemRegistry(root);
  if (registry[id]) {
    console.error(`System "${id}" is already registered. Run \`ista system remove ${id}\` first to replace it.`);
    process.exitCode = 1;
    return;
  }

  let manifest: SystemManifest;
  if (from.startsWith("npm:")) {
    manifest = SystemManifestSchema.parse({
      id,
      displayName: id,
      description: `Compiler package ${from.slice("npm:".length)}`,
      defaultTargetPath: `.${id}/skills/`,
      compilerEntrypoint: from,
    });
  } else {
    const absPath = resolve(cwd, from);
    const manifestPath = join(absPath, "ista-system.yaml");
    if (!existsSync(manifestPath)) {
      console.error(
        `No ista-system.yaml found at ${absPath}. Run \`ista system scaffold ${id}\` to generate one, or write one by hand.`,
      );
      process.exitCode = 1;
      return;
    }
    const parsed = SystemManifestSchema.safeParse(yaml.load(readFileSync(manifestPath, "utf8")));
    if (!parsed.success) {
      console.error(`Invalid ista-system.yaml at ${manifestPath}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
      process.exitCode = 1;
      return;
    }
    // The manifest's compilerEntrypoint is relative to its own directory.
    manifest = { ...parsed.data, compilerEntrypoint: resolve(absPath, parsed.data.compilerEntrypoint) };
  }

  registry[id] = manifest;
  writeSystemRegistry(root, registry);
  console.log(`Registered system "${id}" (entrypoint: ${manifest.compilerEntrypoint}).`);
}

export function runSystemList(cwd: string): void {
  const { root } = currentScope(cwd);
  const registry = readSystemRegistry(root);
  const ids = Object.keys(registry);
  if (ids.length === 0) {
    console.log("No custom systems registered.");
    return;
  }
  for (const id of ids) {
    const m = registry[id]!;
    console.log(`${id}  ${m.displayName}  - ${m.description}`);
  }
}

export function runSystemRemove(cwd: string, id: string): void {
  const { root } = currentScope(cwd);
  const registry = readSystemRegistry(root);
  if (!registry[id]) {
    console.error(`No system "${id}" registered.`);
    process.exitCode = 1;
    return;
  }
  delete registry[id];
  writeSystemRegistry(root, registry);
  console.log(`Removed system "${id}".`);
}

function compilerStub(id: string): string {
  return `/**
 * Ista compiler for "${id}" (ista-plan.md §5.1 has the full interface spec).
 * Ista dynamically imports this file's default export and expects:
 *
 *   {
 *     id: string,
 *     displayName: string,
 *     compile(skill, ctx) -> { filesWritten: string[], skipped: string[], warnings: string[] },
 *     parse(targetPath) -> Array<{ sourcePath: string, suggested: object }>,
 *     supports() -> Record<capability, "enforce" | "advise" | "ignore">,
 *     validate(skill) -> Array<{ level: "warning" | "error", message: string }>,
 *   }
 *
 * \`skill\` (a ResolvedSkill) has: id, name, description, version, capabilities,
 * dir, bodyContent, attachmentContents, systems, ... (skill.yaml, resolved).
 * \`ctx\` has { projectRoot, force }.
 */
export default {
  id: "${id}",
  displayName: "${id}",

  compile(skill, ctx) {
    // TODO: write skill's compiled form under ctx.projectRoot. Honor
    // ctx.force -- don't clobber a manually-edited output file unless it's set.
    return { filesWritten: [], skipped: [], warnings: [\`TODO: "${id}" compiler not implemented yet\`] };
  },

  parse(targetPath) {
    // TODO: scan targetPath for skills this system knows about that aren't
    // in the meta-schema store yet. Powers \`ista scan\`.
    return [];
  },

  supports() {
    // TODO: for each capability, say honestly whether this system can
    // enforce it, only advise about it, or has to ignore it entirely.
    return {
      reads_files: "ignore",
      writes_files: "ignore",
      network: "ignore",
      shell_exec: "ignore",
      tools: "ignore",
      spawn_subagents: "ignore",
      approval: "ignore",
    };
  },

  validate(skill) {
    // TODO: pre-flight checks specific to this system's constraints.
    return [];
  },
};
`;
}

export function runSystemScaffold(cwd: string, id: string): void {
  const dir = join(cwd, `ista-compiler-${id}`);
  if (existsSync(dir)) {
    console.error(`${dir} already exists.`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(dir, { recursive: true });

  const manifest = SystemManifestSchema.parse({
    id,
    displayName: id,
    description: `Compiles Ista skills into ${id}'s format`,
    defaultTargetPath: `.${id}/skills/`,
    compilerEntrypoint: "./compiler.js",
  });
  writeFileSync(join(dir, "ista-system.yaml"), yaml.dump(manifest), "utf8");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify({ name: `ista-compiler-${id}`, version: "0.1.0", type: "module", main: "compiler.js" }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(dir, "compiler.js"), compilerStub(id), "utf8");

  console.log(`Scaffolded a compiler stub at ${dir}.`);
  console.log(`Fill in compiler.js, then run: ista system add ${id} --from ${dir}`);
}
