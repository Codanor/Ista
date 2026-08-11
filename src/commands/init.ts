import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import * as clack from "@clack/prompts";
import { parseSkillMeta } from "../schema.ts";
import { configPath, findIstaRoot, initScope, skillsDir, writeSkill } from "../store.ts";
import { BUILTIN_COMPILERS } from "./sync.ts";

// bootstrap-skills/ ships in the repo itself (§10) -- resolved relative to
// this module's own location so it's found regardless of the caller's cwd.
const BOOTSTRAP_SKILLS_DIR = join(import.meta.dirname, "..", "..", "bootstrap-skills");

interface BootstrapSkillOption {
  dirName: string;
  name: string;
  description: string;
}

function listBootstrapSkillOptions(): BootstrapSkillOption[] {
  if (!existsSync(BOOTSTRAP_SKILLS_DIR)) return [];
  return readdirSync(BOOTSTRAP_SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const meta = parseSkillMeta(yaml.load(readFileSync(join(BOOTSTRAP_SKILLS_DIR, entry.name, "skill.yaml"), "utf8")));
      return { dirName: entry.name, name: meta.name, description: meta.description };
    });
}

// Seeds Ista's own first-party meta-skills (/create-ista-skill,
// /implement-system, /create-ista-attachment) into a freshly-initialized
// scope, so an agent working in this project can extend Ista using Ista
// itself from the start. Never overwrites -- if one's missing (deleted, or
// running from an install without the source tree), it's just skipped.
//
// `only` restricts which bootstrap-skills/* directories get seeded (null =
// all of them, today's behavior). `systemIds`, when set, overwrites each
// seeded skill's `systems` block to enable exactly those compilers instead
// of the file's own hardcoded default (claude-only) -- this is what makes
// the wizard's compiler selection actually take effect for the skills it
// installs, not just the scope-level veto config.
function seedBootstrapSkills(root: string, only: string[] | null, systemIds: string[] | null): void {
  if (!existsSync(BOOTSTRAP_SKILLS_DIR)) return;
  for (const entry of readdirSync(BOOTSTRAP_SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (only && !only.includes(entry.name)) continue;
    const srcDir = join(BOOTSTRAP_SKILLS_DIR, entry.name);
    const destDir = join(skillsDir(root), entry.name);
    if (existsSync(destDir)) continue;
    const rawMeta = parseSkillMeta(yaml.load(readFileSync(join(srcDir, "skill.yaml"), "utf8")));
    const meta = systemIds
      ? parseSkillMeta({
          ...rawMeta,
          systems: Object.fromEntries(systemIds.map((id) => [id, { enabled: true }])),
        })
      : rawMeta;
    writeSkill(destDir, meta);
    writeFileSync(join(destDir, "body.md"), readFileSync(join(srcDir, "body.md"), "utf8"), "utf8");
  }
}

interface WizardSelections {
  systemIds: string[];
  skillDirNames: string[];
}

// The interactive install wizard (only ever entered from runInit, never from
// initScope/ensureUserScope -- those are called incidentally by unrelated
// commands any time .ista doesn't exist yet, and must stay non-interactive).
// Returns null on Ctrl+C, meaning "abort, create nothing."
async function runWizard(): Promise<WizardSelections | null> {
  clack.intro("ista init");

  const systemIds = await clack.multiselect({
    message: "Which AI systems should Ista compile skills for in this project?",
    options: Object.values(BUILTIN_COMPILERS).map((c) => ({ value: c.id, label: c.displayName })),
    initialValues: Object.keys(BUILTIN_COMPILERS),
    required: true, // compiling to nothing is a degenerate setup worth blocking
  });
  if (clack.isCancel(systemIds)) {
    clack.cancel("Aborted.");
    return null;
  }

  const skillOptions = listBootstrapSkillOptions();
  const skillDirNames = await clack.multiselect({
    message: "Which starter skills do you want installed?",
    options: skillOptions.map((s) => ({ value: s.dirName, label: s.name, hint: s.description })),
    initialValues: skillOptions.map((s) => s.dirName),
    required: false, // installing zero starter skills is a legitimate choice
  });
  if (clack.isCancel(skillDirNames)) {
    clack.cancel("Aborted.");
    return null;
  }

  clack.outro("Setup complete.");
  return { systemIds: systemIds as string[], skillDirNames: skillDirNames as string[] };
}

export async function runInit(cwd: string, opts: { yes?: boolean } = {}): Promise<void> {
  const existing = findIstaRoot(cwd);
  if (existing) {
    console.log(`.ista already exists at ${existing}`);
    return;
  }

  const interactive = !opts.yes && Boolean(process.stdin.isTTY);
  const selections = interactive ? await runWizard() : null;
  if (interactive && selections === null) {
    console.log("Aborted -- nothing was created.");
    process.exitCode = 1;
    return;
  }

  initScope(cwd);

  // Non-interactive (--yes, or no TTY) enables every built-in compiler, matching
  // the wizard's own default selection and the --yes flag's documented behavior.
  const systemIds = selections?.systemIds ?? Object.keys(BUILTIN_COMPILERS);
  const systemsConfig = Object.fromEntries(
    Object.keys(BUILTIN_COMPILERS).map((id) => [id, { enabled: systemIds.includes(id) }]),
  );
  writeFileSync(configPath(cwd), yaml.dump({ systems: systemsConfig }), "utf8");

  seedBootstrapSkills(cwd, selections?.skillDirNames ?? null, systemIds);
  console.log(`Initialized .ista/ in ${cwd}`);
}
