# Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test
```

No build step — `src/cli.ts` runs directly. Project layout:

- `src/schema.ts` — the meta-schema
- `src/store.ts` / `scope.ts` / `category.ts` / `linkRegistry.ts` — storage and resolution
- `src/compiler/` — the compiler interface, SDK, and built-in compilers
- `src/commands/` — one file per CLI command
- `bootstrap-skills/` — shipped meta-skills

## Status

All four phases in [`ista-plan.md`](./ista-plan.md) are implemented: core + Claude compiler, multi-system + capability honesty, scoping/categories/cross-scope commands, and custom systems/bootstrap skills/git-backed org sync. A web UI and subagent orchestration are explicit non-goals (§13).
