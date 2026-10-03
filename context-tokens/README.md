# context-tokens

Shows how many tokens the context holds, beside the prompt footer of the
Claude Code desktop app and terminal: `88.1k`.

| tokens | color |
| --- | --- |
| under 100k | green |
| 100k to 150k | yellow |
| 150k and more | red |

The figure is the last API response's input side (`total_input_tokens` in a
status line's input) and refreshes at session start, after each tool call and
when a turn ends. It takes the place of the mode labels (`focus`,
`memory paused`), which follow it after a `•`.

## Install

```sh
claude plugin marketplace add 0xBADC0FFEE/claude-code-mods
claude plugin install context-tokens@claude-code-mods
```

Needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.
