import { randomBytes } from "node:crypto";

// e.g. "code-review" -> "cr-8f3a1c". Falls back to the first two characters
// of the name when it's a single word (e.g. "lint" -> "li-...").
export function generateSkillId(name: string): string {
  const words = name.split(/[-_\s]+/).filter(Boolean);
  const initials =
    words.length > 1
      ? words.map((w) => w[0]!.toLowerCase()).join("")
      : name.slice(0, 2).toLowerCase();
  return `${initials}-${randomBytes(3).toString("hex")}`;
}
