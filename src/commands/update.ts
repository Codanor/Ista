import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPatch } from "diff";
import { confirm } from "../confirm.ts";
import { computeContentHash } from "../linking.ts";
import { parseSkillMeta, type Scope } from "../schema.ts";
import { resolveScopeRoot } from "../scope.ts";
import { findSkillInScope, resolveSkill, writeSkill } from "../store.ts";

// Propagates a truth skill's current content to one or more forks (§9.5).
// Fast-forwards silently when the fork's content hash still matches what it
// was forked/last-updated with (no local edits to lose); otherwise shows a
// unified diff and requires --force or an interactive y/n before applying.
// "or open a merge flow" (spec's other option) is deliberately not built --
// confirm-or-abort covers the safety requirement without a merge UI nobody's
// asked for yet.
export async function runUpdate(
  cwd: string,
  skillName: string,
  truthScope: Scope,
  targetScopes: Scope[],
  opts: { force: boolean },
): Promise<void> {
  const truthRoot = resolveScopeRoot(truthScope, cwd);
  if (!truthRoot) {
    console.error(`Scope "${truthScope}" isn't available here.`);
    process.exitCode = 1;
    return;
  }
  const truth = findSkillInScope(truthRoot, skillName);
  if (!truth) {
    console.error(`No skill named "${skillName}" found in ${truthScope} scope.`);
    process.exitCode = 1;
    return;
  }
  const truthResolved = resolveSkill(truth.dir, truth.meta);

  for (const targetScope of targetScopes) {
    const targetRoot = resolveScopeRoot(targetScope, cwd);
    if (!targetRoot) {
      console.error(`Scope "${targetScope}" isn't available here, skipping.`);
      continue;
    }
    const target = findSkillInScope(targetRoot, skillName);
    if (!target) {
      console.error(`No skill named "${skillName}" found in ${targetScope} scope, skipping.`);
      continue;
    }
    const forkedFrom = target.meta.forked_from;
    if (!forkedFrom) {
      console.error(`"${skillName}" in ${targetScope} scope isn't a fork -- nothing to update.`);
      continue;
    }
    if (forkedFrom.scope !== truthScope || forkedFrom.id !== truth.meta.id) {
      console.error(
        `"${skillName}" in ${targetScope} scope wasn't forked from ${truthScope}:${truth.meta.id} -- refusing to update from an unrelated truth.`,
      );
      continue;
    }

    const targetResolved = resolveSkill(target.dir, target.meta);
    const unchangedSinceFork = computeContentHash(targetResolved) === forkedFrom.content_hash;

    if (!unchangedSinceFork) {
      console.log(`\n"${skillName}" in ${targetScope} scope has local edits since it was forked/last updated:`);
      console.log(createPatch("body.md", targetResolved.bodyContent, truthResolved.bodyContent));
      console.log(
        createPatch(
          "capabilities",
          JSON.stringify(target.meta.capabilities, null, 2),
          JSON.stringify(truth.meta.capabilities, null, 2),
        ),
      );

      const proceed = opts.force || (await confirm("Apply the truth's changes anyway, overwriting the local edits above? (y/N) "));
      if (!proceed) {
        console.log(`Skipped "${skillName}" in ${targetScope} scope.`);
        continue;
      }
    }

    writeFileSync(join(target.dir, target.meta.body), truthResolved.bodyContent, "utf8");
    for (const attachment of truthResolved.attachmentContents) {
      const dest = join(target.dir, attachment.path);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, attachment.content, "utf8");
    }

    const updatedMeta = parseSkillMeta({
      ...target.meta,
      capabilities: truth.meta.capabilities,
      forked_from: {
        scope: truthScope,
        id: truth.meta.id,
        version: truth.meta.version,
        content_hash: computeContentHash(truthResolved),
      },
    });
    writeSkill(target.dir, updatedMeta);

    console.log(
      `Updated "${skillName}" in ${targetScope} scope to ${truthScope}:${truth.meta.id}@${truth.meta.version}` +
        (unchangedSinceFork ? " (fast-forward)." : " (applied over local edits)."),
    );
  }
}
