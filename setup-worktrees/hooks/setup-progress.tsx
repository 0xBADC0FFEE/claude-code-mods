import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { SetupProgress } from '../types'

const WORKTREES_DIR = '.worktrees'
const LOGS_DIR = `${WORKTREES_DIR}/.logs`
const STEP_MARKER = '::step::'
const LOG_PANE = 'setup-log'
const LOG_PANE_TITLE = 'Setup log'
const LOG_PANE_LINES = 1000
const MIN_FENCE = 3
const ANSI_ESCAPE = /\x1b\[[0-9;?]*[A-Za-z]/g
const POLL_MS = 1000
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SPINNER_FRAME_MS = 100
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

type SetupFiles = { log: string; exitCode: string }

const IDLE: SetupProgress = { phase: 'idle' }

const progress = atom({ plugin: 'setup-worktrees', key: 'setup' } as const, IDLE)
const setupLog = atom({ plugin: 'setup-worktrees', key: 'setupLog' } as const, '')
const spinnerFrame = atom({ plugin: 'setup-worktrees', key: 'spinnerFrame' } as const, 0)

/**
 * Draws the setup progress that `watchSetup` tracks above the prompt, and its log in a pane.
 * @param on the module's `on`
 * @returns nothing
 */
export const registerSetupProgress: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const setup = await read($, progress)
    if (e.props.hasSurvey || setup.phase === 'idle') return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const openLog = () => void $.ui.open({ id: LOG_PANE, title: LOG_PANE_TITLE })
    const logButton = <Button key="setup-log" label="Log" onPress={openLog} />

    if (setup.phase === 'running') {
      const spinner = SPINNER_FRAMES[(await read($, spinnerFrame)) % SPINNER_FRAMES.length]
      return (
        <Box flexDirection="row" flexWrap="nowrap" gap="sm" alignItems="center">
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor wrap="truncate-end">{spinner} {withStep('Setup', setup.step)}</Text>
          </Box>
          {logButton}
        </Box>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="nowrap" gap="sm" alignItems="center">
        <Box flexGrow={1} flexShrink={1}>
          <Text color="error" wrap="truncate-end">{withStep(`Setup failed (exit ${setup.exitCode})`, setup.step)}</Text>
        </Box>
        {logButton}
        <Button key="setup-dismiss" label="Dismiss" onPress={() => void update($, progress, () => IDLE)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: LOG_PANE }, async ($, e) => {
    const { Markdown, Text } = $.ui.resolve(e)
    const log = await read($, setupLog)
    if (log === '' || !(await $.fs.exists(log))) return <Text dimColor>No setup log in this session.</Text>
    // Markdown, not Code: the desktop draws a Code element's text unselectable.
    return <Markdown key="setup-log-text" text={codeBlock(printable(lastLines(await $.fs.read(log), LOG_PANE_LINES)))} />
  })
}

/**
 * Tracks the setup script of the worktree at `cwd` until it exits; does nothing outside a worktree.
 * @param $ the engine
 * @param cwd the session's working directory
 * @returns resolves once the first poll is drawn
 */
export async function watchSetup($: EngineInterface, cwd: string): Promise<void> {
  const files = await setupFiles($, cwd)
  if (files === undefined || !(await $.fs.exists(files.log))) return
  await update($, setupLog, () => files.log)

  const exitCode = await readExitCode($, files)
  if (exitCode !== undefined) {
    const step = lastStep(await $.fs.read(files.log))
    await update($, progress, (): SetupProgress => (exitCode === 0 ? IDLE : { phase: 'failed', exitCode, step }))
    return
  }

  const startedAt = await $.clock.now()
  const spin = $.clock.every(SPINNER_FRAME_MS, () => void update($, spinnerFrame, frame => frame + 1))
  const timer = $.clock.every(POLL_MS, () =>
    void poll($, files, startedAt).then(isDone => {
      if (!isDone) return
      timer.cancel()
      spin.cancel()
    }),
  )
  await poll($, files, startedAt)
}

async function poll($: EngineInterface, files: SetupFiles, startedAt: number): Promise<boolean> {
  const elapsedSeconds = Math.round(((await $.clock.now()) - startedAt) / MS_PER_SECOND)
  const exitCode = await readExitCode($, files)
  const step = lastStep(await $.fs.read(files.log))
  // The log pane reads the file while drawing, so it redraws with each poll.
  $.ui.invalidate('ui.render')

  if (exitCode === undefined) {
    await update($, progress, (): SetupProgress => ({ phase: 'running', step }))
    return false
  }

  if (exitCode === 0) {
    await update($, progress, () => IDLE)
    $.ui.toast(`Setup done in ${formatDuration(elapsedSeconds)}`)
  } else {
    await update($, progress, (): SetupProgress => ({ phase: 'failed', exitCode, step }))
  }
  return true
}

async function setupFiles($: EngineInterface, cwd: string): Promise<SetupFiles | undefined> {
  const { exitCode, stdout } = await $.process.run(
    ['git', 'rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'],
    { cwd },
  )
  if (exitCode !== 0) return undefined

  const [commonDir = '', worktree = ''] = stdout.trim().split('\n')
  const root = commonDir.replace(/\/\.git\/?$/, '')
  const prefix = `${root}/${WORKTREES_DIR}/`
  if (!worktree.startsWith(prefix)) return undefined

  const base = `${root}/${LOGS_DIR}/${worktree.slice(prefix.length).replaceAll('/', '_')}.setup`
  return { log: `${base}.log`, exitCode: `${base}.exit` }
}

async function readExitCode($: EngineInterface, files: SetupFiles): Promise<number | undefined> {
  if (!(await $.fs.exists(files.exitCode))) return undefined
  return Number((await $.fs.read(files.exitCode)).trim())
}

function lastStep(log: string): string {
  const marker = log.split(/\r?\n/).findLast(line => line.startsWith(STEP_MARKER))
  return marker?.slice(STEP_MARKER.length).trim() ?? ''
}

function withStep(label: string, step: string): string {
  return step === '' ? label : `${label} · ${step}`
}

function codeBlock(text: string): string {
  const longestBackticks = Math.max(0, ...(text.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(MIN_FENCE, longestBackticks + 1))
  return `${fence}text\n${text}\n${fence}`
}

function printable(text: string): string {
  return text.replace(ANSI_ESCAPE, '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
}

function lastLines(text: string, count: number): string {
  return text.split('\n').slice(-count).join('\n')
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`
}
