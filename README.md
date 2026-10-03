# claude-code-mods

Mods for Claude Code: plugins built on **function hooks**, TypeScript that
runs inside Claude Code's own process. Function hooks are early access, so each
mod needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and the API can change between
releases.

| mod | what it does |
| --- | --- |
| [context-tokens](context-tokens/README.md) | the context tokens in use, beside the desktop app's prompt footer, colored by size |

## Install

Turn function hooks on, in `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

The repository is a marketplace. Add it once, then install a mod:

```sh
claude plugin marketplace add 0xBADC0FFEE/claude-code-mods
claude plugin install context-tokens@claude-code-mods
```

Or load one straight from a clone, for one session:

```sh
git clone https://github.com/0xBADC0FFEE/claude-code-mods
cd claude-code-mods
claude --plugin-dir context-tokens
```

## Layout

Each mod is a folder of its own: `.claude-plugin/plugin.json`,
`hooks/hooks.json` naming the hooks module, `types/index.d.ts` with its
`$.state` contract, and a README. The root holds the marketplace manifest.

## Development

```sh
claude plugin validate .
claude plugin validate context-tokens
```

CI runs both on every pull request. Claude Code writes the engine's
declarations into `<mod>/.claude-plugin/types/` when it loads the mod from a
plugin folder; with them present, `npx -p typescript tsc -p <mod>` typechecks it.

## License

[MIT](LICENSE).
