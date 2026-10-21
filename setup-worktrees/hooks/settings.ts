import type { WorktreeScripts } from '../types'

export const INSTALLED_HOOK_PATH = '.claude/setup-worktrees/hook.sh'

const HOOK_INVOCATION = `bash "$HOME/${INSTALLED_HOOK_PATH}"`
const CREATE_EVENT = 'WorktreeCreate'
const REMOVE_EVENT = 'WorktreeRemove'
const SINGLE_QUOTE_ESCAPE = `'\\''`

type Settings = { hooks?: Record<string, unknown> } & Record<string, unknown>
type HookMatcher = { hooks: { type: 'command'; command: string }[] }

export const EMPTY_SCRIPTS: WorktreeScripts = { setup: '', teardown: '' }

/**
 * Returns `settings` with the WorktreeCreate/WorktreeRemove hooks replaced by this mod's.
 * @param settings the parsed settings.local.json
 * @param scripts the setup and teardown scripts, inlined into the hook commands
 * @returns a new settings object
 */
export function withWorktreeHooks(settings: Settings, scripts: WorktreeScripts): Settings {
  return {
    ...settings,
    hooks: {
      ...settings.hooks,
      [CREATE_EVENT]: [commandMatcher('create', scripts.setup)],
      [REMOVE_EVENT]: [commandMatcher('remove', scripts.teardown)],
    },
  }
}

/**
 * Reads back the scripts a previous `withWorktreeHooks` inlined.
 * @param settings the parsed settings.local.json
 * @returns the scripts, or `undefined` when the hooks are absent or not this mod's
 */
export function readWorktreeScripts(settings: Settings): WorktreeScripts | undefined {
  const setup = inlinedScript(settings.hooks?.[CREATE_EVENT], 'create')
  const teardown = inlinedScript(settings.hooks?.[REMOVE_EVENT], 'remove')
  return setup === undefined || teardown === undefined ? undefined : { setup, teardown }
}

function commandMatcher(action: string, script: string): HookMatcher {
  const command = script === '' ? `${HOOK_INVOCATION} ${action}` : `${HOOK_INVOCATION} ${action} ${shellQuote(script)}`
  return { hooks: [{ type: 'command', command }] }
}

function inlinedScript(matchers: unknown, action: string): string | undefined {
  const command = (matchers as HookMatcher[] | undefined)?.[0]?.hooks?.[0]?.command
  const prefix = `${HOOK_INVOCATION} ${action}`
  if (command === prefix) return ''
  if (!command?.startsWith(`${prefix} '`) || !command.endsWith("'")) return undefined
  return command.slice(prefix.length + 2, -1).replaceAll(SINGLE_QUOTE_ESCAPE, "'")
}

function shellQuote(text: string): string {
  return `'${text.replaceAll("'", SINGLE_QUOTE_ESCAPE)}'`
}
