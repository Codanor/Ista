# Writing a custom compiler

```bash
ista system scaffold mytool          # writes ./ista-compiler-mytool/{ista-system.yaml,compiler.js,package.json}
# fill in compile()/parse()/supports()/validate() in compiler.js
ista system add mytool --from ./ista-compiler-mytool
# enable "mytool" in a skill's systems: block, then:
ista sync
```

`compiler.js` exports a plain object (no build step, no dependency on a published SDK package) matching the same interface every built-in compiler implements. See the generated file's inline docs for the exact shape, or [`src/compiler/types.ts`](../src/compiler/types.ts) for the canonical TypeScript definitions.
