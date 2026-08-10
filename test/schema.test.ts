import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilitiesSchema, SkillMetaSchema, activeCapabilities } from "../src/schema.ts";

test("valid minimal skill.yaml parses with defaults applied", () => {
  const result = SkillMetaSchema.parse({
    id: "cr-8f3a1c",
    name: "code-review",
    description: "Reviews code changes",
  });
  assert.equal(result.version, "0.1.0");
  assert.equal(result.capabilities.approval, "required");
  assert.equal(result.capabilities.shell_exec, false);
  assert.deepEqual(result.attachments, []);
});

test("missing required fields are rejected", () => {
  const result = SkillMetaSchema.safeParse({ name: "x" });
  assert.equal(result.success, false);
});

test("activeCapabilities reports only what's actually requested", () => {
  const defaults = CapabilitiesSchema.parse({});
  assert.deepEqual(activeCapabilities(defaults), ["approval"]); // approval defaults to "required", never silent

  const busy = CapabilitiesSchema.parse({
    reads_files: true,
    shell_exec: true,
    tools: ["git"],
    approval: "inherit",
  });
  assert.deepEqual(activeCapabilities(busy), ["reads_files", "shell_exec", "tools"]);
});
