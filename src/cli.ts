#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { runCategoryAdd, runCategoryList, runCategoryTree } from "./commands/category.ts";
import { runFork } from "./commands/fork.ts";
import { runInit } from "./commands/init.ts";
import { runLink } from "./commands/link.ts";
import { runMove } from "./commands/move.ts";
import { runPull } from "./commands/pull.ts";
import { runPush } from "./commands/push.ts";
import { runScan } from "./commands/scan.ts";
import { runSkillAttach } from "./commands/skillAttach.ts";
import { runSkillDelete } from "./commands/skillDelete.ts";
import { runSkillList } from "./commands/skillList.ts";
import { runSkillNew } from "./commands/skillNew.ts";
import { runSkillValidate } from "./commands/skillValidate.ts";
import { runSync } from "./commands/sync.ts";
import { runSystemAdd, runSystemList, runSystemRemove, runSystemScaffold } from "./commands/system.ts";
import { runUpdate } from "./commands/update.ts";
import { ScopeSchema } from "./schema.ts";
import type { ScopeLocation } from "./scope.ts";

// "project"/"user"/"org" resolve the usual cwd-relative way; anything else is
// treated as a literal path to another project's .ista/ -- the escape hatch
// for linking/forking directly between two unrelated project trees without
// routing through a shared org mirror.
function parseScopeRef(value: string): ScopeLocation {
  const result = ScopeSchema.safeParse(value);
  return result.success ? { scope: result.data } : { scope: "path", path: resolve(value) };
}

const program = new Command();
program.name("ista").description("Cross-platform AI skill management CLI").version("0.1.0");

program
  .command("init")
  .description("Create a project-scoped .ista/ here")
  .option("-y, --yes", "skip the interactive setup wizard and install everything (default when not run in a terminal)", false)
  .action((opts: { yes: boolean }) => runInit(process.cwd(), opts));

const skill = program.command("skill").description("Manage skills");

skill
  .command("new <name>")
  .description("Scaffold a new skill")
  .action((name: string) => runSkillNew(process.cwd(), name));

skill
  .command("validate [path]")
  .description("Validate skill.yaml against the meta-schema")
  .action((path?: string) => runSkillValidate(process.cwd(), path));

skill
  .command("list")
  .description("List skills in this scope")
  .option("--category <name>", "list only skills in this category")
  .action((opts: { category?: string }) => runSkillList(process.cwd(), opts));

skill
  .command("attach <skill> <attachment>")
  .description("Attach a content fragment to a skill (scaffolds it if it doesn't exist)")
  .action((skillName: string, attachment: string) => runSkillAttach(process.cwd(), skillName, attachment));

skill
  .command("delete <skill>")
  .description("Delete a skill (backlink-aware -- refuses if other scopes link to it)")
  .option("--force", "delete even if other scopes link to it, leaving dangling links", false)
  .option("--convert-to-forks", "turn every linking scope into an independent fork before deleting", false)
  .action((skillName: string, opts: { force: boolean; convertToForks: boolean }) =>
    runSkillDelete(process.cwd(), skillName, opts),
  );

program
  .command("sync")
  .description("Compile all skills to all enabled systems")
  .option("--force", "overwrite files even if manually edited since last sync", false)
  .action((opts: { force: boolean }) => runSync(process.cwd(), opts));

program
  .command("scan")
  .description("Detect drift between the meta-schema store and each system's native output")
  .action(() => runScan(process.cwd()));

program
  .command("push")
  .description("Publish local org-scope changes to its git remote")
  .option("-m, --message <message>", "commit message")
  .action((opts: { message?: string }) => runPush(process.cwd(), opts));

program
  .command("pull")
  .description("Sync the local org-scope mirror from its git remote")
  .action(() => runPull(process.cwd()));

const system = program.command("system").description("Manage custom/pluggable compiler systems");

system
  .command("add <id>")
  .description("Register a compiler (local directory or npm: package)")
  .requiredOption("--from <path|npm:pkg>", "where to load the compiler from")
  .action((id: string, opts: { from: string }) => runSystemAdd(process.cwd(), id, opts.from));

system
  .command("list")
  .description("List registered custom systems")
  .action(() => runSystemList(process.cwd()));

system
  .command("remove <id>")
  .description("Unregister a custom system")
  .action((id: string) => runSystemRemove(process.cwd(), id));

system
  .command("scaffold <id>")
  .description("Generate a stub compiler package implementing the compiler interface")
  .action((id: string) => runSystemScaffold(process.cwd(), id));

program
  .command("link <skill> <from>")
  .description("Reference a skill from another scope without copying it")
  .option("--category <name>", "category to file the link under", "uncategorized")
  .action((skillName: string, from: string, opts: { category: string }) =>
    runLink(process.cwd(), skillName, parseScopeRef(from), opts),
  );

program
  .command("move <skill> <target-scope>")
  .description("Relocate a skill to another scope, leaving a link back")
  .option("--category <name>", "category to file the back-link under", "uncategorized")
  .action((skillName: string, targetScope: string, opts: { category: string }) =>
    runMove(process.cwd(), skillName, parseScopeRef(targetScope), opts),
  );

program
  .command("fork <skill> <from>")
  .description("Copy a skill from another scope as an independent skill with recorded lineage")
  .action((skillName: string, from: string) => runFork(process.cwd(), skillName, parseScopeRef(from)));

program
  .command("update <skill> <truth-location> <targets...>")
  .description("Propagate a truth skill's current content to its forks")
  .option("--force", "apply without confirming, even if a fork has diverged", false)
  .action((skillName: string, truthLocation: string, targets: string[], opts: { force: boolean }) =>
    runUpdate(process.cwd(), skillName, parseScopeRef(truthLocation), targets.map(parseScopeRef), opts),
  );

const category = program.command("category").description("Browse the category/index layer");

category
  .command("add <skill> <category>")
  .description("Add a skill from this scope to a category")
  .action((skillName: string, categoryName: string) => runCategoryAdd(process.cwd(), skillName, categoryName));

category
  .command("list")
  .description("List categories in this scope")
  .action(() => runCategoryList(process.cwd()));

category
  .command("tree")
  .description("Show categories with their resolved skill entries")
  .action(() => runCategoryTree(process.cwd()));

await program.parseAsync();
