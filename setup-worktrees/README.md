# setup-worktrees

Puts the worktree of every new session, desktop app or terminal, in
`<repo>/.worktrees/<name>` on branch `worktree-<name>`, and runs your own
scripts in it. `/setup-worktrees` opens a pane with two fields:

| script | runs |
| --- | --- |
| setup | in the background inside each new worktree |
| teardown | in the background before a worktree is removed |

Saving writes `WorktreeCreate` and `WorktreeRemove` command hooks, with the
scripts inlined, to the repository's `.claude/settings.local.json`: each
developer keeps their own, and nothing is committed. Logs go to
`.worktrees/.logs/`.

When a session is removed, a worktree with no uncommitted changes is deleted,
and so is its branch when it holds no commits found on no other branch.
Anything else opens a macOS dialog that offers to delete the worktree, the
branch, or keep both.

The hooks run `~/.claude/setup-worktrees/hook.sh`, which the mod writes on
save. They need `jq` and, for the dialog, macOS.

## Install

```sh
claude plugin marketplace add 0xBADC0FFEE/claude-code-mods
claude plugin install setup-worktrees@claude-code-mods
```

Needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.
