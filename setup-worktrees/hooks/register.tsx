import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, UiPressArgument } from 'claude-code'

import type { ScriptKind, WorktreeScripts } from '../types'
import { EMPTY_SCRIPTS, INSTALLED_HOOK_PATH, readWorktreeScripts, withWorktreeHooks } from './settings'

const COMMAND = 'setup-worktrees'
const PANE = 'setup-worktrees'
const PANE_TITLE = 'Setup worktrees'
const SETTINGS_FILE = '.claude/settings.local.json'
const BUNDLED_HOOK = 'scripts/hook.sh'
const SCRIPT_ROWS = 6

const root = atom({ plugin: 'setup-worktrees', key: 'root' } as const, '')
const draft = atom({ plugin: 'setup-worktrees', key: 'draft' } as const, EMPTY_SCRIPTS)
const error = atom({ plugin: 'setup-worktrees', key: 'error' } as const, '')

type ScriptField = { kind: ScriptKind; title: string; placeholder: string }

const SCRIPT_FIELDS: readonly ScriptField[] = [
  { kind: 'setup', title: 'Setup — runs in each new worktree', placeholder: 'cp "$WORKTREE_ROOT_PATH/.env" .\nnpm ci' },
  { kind: 'teardown', title: 'Teardown — runs before a worktree is removed', placeholder: 'docker compose down' },
]

type ScriptVariable = { name: string; meaning: string }

const SCRIPT_VARIABLES: readonly ScriptVariable[] = [
  { name: 'WORKTREE_ROOT_PATH', meaning: 'Main checkout of the repository. Click to copy' },
  { name: 'WORKTREE_PATH', meaning: 'This worktree, the working directory. Click to copy' },
  { name: 'WORKTREE_NAME', meaning: 'Folder name under .worktrees/. Click to copy' },
]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Edit this repo\'s local worktree setup/teardown scripts',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const repo = await repoRoot($)
    const scripts = readWorktreeScripts(await readSettings($, repo))
    await update($, root, () => repo)
    await update($, draft, () => scripts ?? EMPTY_SCRIPTS)
    await update($, error, () => '')
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: `${PANE_TITLE} pane opened.` }
  }).catch(($, e, next) => ({ text: next.error.message ?? next.error.kind }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    if (!('Input' in elements)) return <Text>Edit the scripts from the desktop app or a terminal.</Text>
    const { Input } = elements

    const repo = await read($, root)
    const scripts = await read($, draft)
    const stored = readWorktreeScripts(await readSettings($, repo))
    const failure = await read($, error)
    const hasChanges = !isSameScripts(scripts, stored ?? EMPTY_SCRIPTS)
    const notice = failure !== '' ? failure : stored === undefined ? 'Not set up' : ''
    const edit = (kind: ScriptKind) => (value: string) =>
      void update($, draft, previous => ({ ...previous, [kind]: value }))
    const save = () =>
      void saveScripts($, repo, scripts).catch((failure: unknown) => update($, error, () => String(failure)))

    const copy = (text: string, surface: UiPressArgument['surface']) =>
      void $.ui.copy({ text, surface }).then(({ isCopied }) => isCopied && $.ui.toast(`Copied ${text}`))

    return (
      <Box flexDirection="column" alignItems="stretch" gap="lg" padding="md">
        <Box flexDirection="column" gap="xs">
          <Box flexDirection="row" flexWrap="wrap" gap="xs">
            {SCRIPT_VARIABLES.map(({ name }) => (
              <Button
                key={`variable-${name}`}
                variant="secondary"
                hover={{ scope: `variable-${name}` }}
                onPress={press => copy(`$${name}`, press.surface)}
              >
                <Text mono>${name}</Text>
              </Button>
            ))}
          </Box>
          <Box position="relative" minHeight={1}>
            {SCRIPT_VARIABLES.map(({ name, meaning }) => (
              <Box
                key={`meaning-${name}`}
                position="absolute"
                top={0}
                left={0}
                right={0}
                display="none"
                hover={{ scope: `variable-${name}`, display: 'flex' }}
              >
                <Text size="caption" dimColor>{meaning}</Text>
              </Box>
            ))}
          </Box>
        </Box>
        {SCRIPT_FIELDS.map(({ kind, title, placeholder }) => (
          <Box key={kind} flexDirection="column" alignItems="stretch" gap="xs">
            <Text size="footnote" weight="medium">{title}</Text>
            <Input
              key={`script-${kind}`}
              rows={SCRIPT_ROWS}
              placeholder={placeholder}
              value={scripts[kind]}
              onInput={edit(kind)}
              onSubmit={save}
            />
          </Box>
        ))}
        <Box flexDirection="row" gap="md" alignItems="center">
          <Button
            key="save"
            label="Save"
            variant={hasChanges ? 'primary' : 'secondary'}
            dimColor={!hasChanges}
            onPress={hasChanges ? save : ignorePress}
          />
          {notice !== '' && <Text size="caption" color={failure !== '' ? 'error' : 'subtle'}>{notice}</Text>}
        </Box>
      </Box>
    )
  })
}

function isSameScripts(a: WorktreeScripts, b: WorktreeScripts): boolean {
  return a.setup === b.setup && a.teardown === b.teardown
}

// The surface's Button has no disabled state, so an unchanged form gets a dimmed no-op.
function ignorePress(): void {}

async function saveScripts($: EngineInterface, repo: string, scripts: WorktreeScripts): Promise<void> {
  await installHook($)
  await $.fs.write(`${repo}/${SETTINGS_FILE}`, `${JSON.stringify(withWorktreeHooks(await readSettings($, repo), scripts), null, 2)}\n`)
  await ensureIgnored($, repo, SETTINGS_FILE)
  await update($, error, () => '')
  $.ui.invalidate('ui.render')
}

async function installHook($: EngineInterface): Promise<void> {
  const home = await $.env.get('HOME')
  if (!home) throw new Error('HOME is not set')
  await $.fs.write(`${home}/${INSTALLED_HOOK_PATH}`, await $.fs.read(`${$.plugin.root}/${BUNDLED_HOOK}`))
}

async function readSettings($: EngineInterface, repo: string): Promise<Record<string, unknown>> {
  const path = `${repo}/${SETTINGS_FILE}`
  return (await $.fs.exists(path)) ? JSON.parse(await $.fs.read(path)) : {}
}

async function ensureIgnored($: EngineInterface, repo: string, file: string): Promise<void> {
  const { exitCode } = await $.process.run(['git', 'check-ignore', '-q', file], { cwd: repo })
  if (exitCode === 0) return

  const excludeFile = `${repo}/.git/info/exclude`
  const current = (await $.fs.exists(excludeFile)) ? await $.fs.read(excludeFile) : ''
  const separator = current === '' || current.endsWith('\n') ? '' : '\n'
  await $.fs.write(excludeFile, `${current}${separator}/${file}\n`)
}

async function repoRoot($: EngineInterface): Promise<string> {
  const { exitCode, stdout } = await $.process.run(
    ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    { cwd: await $.session.root() },
  )
  if (exitCode !== 0) throw new Error('This session is not inside a git repository.')
  return stdout.trim().replace(/\/\.git\/?$/, '')
}
