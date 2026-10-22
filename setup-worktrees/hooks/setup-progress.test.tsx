import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const ROOT = '/repo'
const WORKTREE = `${ROOT}/.worktrees/feature`
const LOG = `${ROOT}/.worktrees/.logs/feature.setup.log`
const EXIT_CODE = `${ROOT}/.worktrees/.logs/feature.setup.exit`

const BAND = {
  plugin: 'setup-worktrees',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const LOG_PANE = {
  plugin: 'setup-worktrees',
  component: 'Pane',
  requestId: 'setup-log',
  props: {
    title: 'Setup log',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`shows the current step, then a toast when setup succeeds (${surface})`, async ($, on) => {
    const files: Record<string, string> = { [LOG]: 'npm warn deprecated\n' }
    const toasts: string[] = []
    const clock = mock.clock(on)
    mockWorld(on, files)
    on('ui.toast', (_, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })

    await $.session.start({ cwd: WORKTREE, surface, isInteractive: true })
    await clock.settle()
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: / Setup$/ })).toBeDefined()

    files[LOG] += '::step::Installing dependencies\nadded 12 packages\n'
    await clock.advance(2000)
    expect(await band.find({ type: 'Text', text: / Setup · Installing dependencies$/ })).toBeDefined()

    files[EXIT_CODE] = '0\n'
    await clock.advance(1000)
    expect(toasts).toEqual(['Setup done in 0:03'])
    expect(await band.find({ type: 'Text', text: / Setup · Installing dependencies$/ })).toBeUndefined()
    await band.unmount()
  })

  test(`keeps a failed setup with its step until dismissed (${surface})`, async ($, on) => {
    const files: Record<string, string> = { [LOG]: '::step::Starting sys\nboom\n', [EXIT_CODE]: '3\n' }
    mock.clock(on)
    mockWorld(on, files)

    await $.session.start({ cwd: WORKTREE, surface, isInteractive: true })
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: 'Setup failed (exit 3) · Starting sys' })).toBeDefined()

    await band.press({ key: 'setup-dismiss' })
    expect(await band.find({ key: 'setup-dismiss' })).toBeUndefined()
    await band.unmount()
  })

  test(`opens the whole log in a pane (${surface})`, async ($, on) => {
    const files: Record<string, string> = { [LOG]: '::step::Starting sys\n\x1b[31mboom\x1b[0m\n', [EXIT_CODE]: '3\n' }
    const opened: string[] = []
    mock.clock(on)
    mockWorld(on, files)
    on('ui.open', (_, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })

    await $.session.start({ cwd: WORKTREE, surface, isInteractive: true })
    const band = await $.ui.mount({ ...BAND, surface })
    await band.press({ key: 'setup-log' })
    expect(opened).toEqual(['setup-log'])

    const pane = await $.ui.mount({ ...LOG_PANE, surface })
    expect((await pane.find({ key: 'setup-log-text' }))?.props).toMatchObject({ text: '```text\n::step::Starting sys\nboom\n\n```' })
    await pane.unmount()
    await band.unmount()
  })
}

test('shows nothing outside a worktree', async ($, on) => {
  mock.clock(on)
  mockWorld(on, { [LOG]: '::step::Installing dependencies\n' })

  await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: / Setup · Installing dependencies$/ })).toBeUndefined()
  await band.unmount()
})

function mockWorld(on: On, files: Record<string, string>): void {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine-band" />
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'setup-worktrees' } }))
  mock.env(on, { HOME: '/home' })
  on('process.run', (_, e) => ({
    value: { exitCode: 0, stdout: `${ROOT}/.git\n${e.init?.cwd}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.exists', (_, e) => ({ value: e.path in files }))
  on('fs.read', (_, e) => ({ value: files[e.path] ?? '' }))
}
