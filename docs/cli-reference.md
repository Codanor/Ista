# CLI reference

See [Concepts](./concepts.md) for what scopes, categories, and the cross-scope commands (`link`/`move`/`fork`/`update`) actually mean.

```
ista init [-y|--yes]                              # create project-scoped .ista/ here (interactive wizard unless -y or non-TTY)

# skills
ista skill new <name>                             # scaffold a new skill
ista skill list [--category <name>]                # list skills in this scope
ista skill validate [path]                         # validate skill.yaml
ista skill attach <skill> <attachment>              # add/register a content fragment
ista skill delete <skill> [--force] [--convert-to-forks]

# compilation
ista sync [--force]                                # compile all skills to all enabled systems
ista scan                                          # detect drift: native-only, meta-only, dangling refs

# cross-scope (scope is always one of: project | user | org)
ista link <skill> <from> [--category <name>]        # reference without copying
ista move <skill> <target-scope> [--category <name>]# relocate, leave a link back
ista fork <skill> <from>                            # independent copy with lineage
ista update <skill> <truth-location> <targets...> [--force]

# organization
ista category add <skill> <category>              # file a same-scope skill into a category
ista category list
ista category tree

# custom systems
ista system scaffold <id>                          # generate a stub compiler package
ista system add <id> --from <path|npm:pkg>
ista system list
ista system remove <id>

# git-backed org scope
ista pull                                          # clone/fast-forward the org mirror
ista push [-m <message>]                           # commit + push local org changes
```
