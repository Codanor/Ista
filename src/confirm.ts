import { createInterface } from "node:readline/promises";

// Non-interactive contexts (CI, piped input) get a hard "no" instead of
// hanging on a prompt nobody can answer -- callers should tell the user to
// pass --force instead.
export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
