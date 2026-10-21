import { expect, test } from 'claude-code/testing'

const REPO = '/repo'

const PANE = {
  plugin: 'setup-worktrees',
  component: 'Pane',
  requestId: 'setup-worktrees',
  props: {
    title: 'Setup worktrees',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('copies a variable, edits a script and saves it', async ($, on) => {
  const written: Record<string, string> = {}
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'setup-worktrees' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.root', () => ({ value: REPO }))
  on('env.get', () => ({ value: '/home' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${REPO}/.git\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.exists', (_, e) => ({ value: e.path in written }))
  on('fs.read', (_, e) => ({ value: written[e.path] ?? '#!/usr/bin/env bash' }))
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('fs.write', (_, e) => {
    written[e.path] = e.text
    return { value: undefined }
  })

  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const path of Object.keys(written)) delete written[path]
    await $.command.run({ command: 'setup-worktrees', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.press({ key: 'variable-WORKTREE_ROOT_PATH' })
    expect(copied.at(-1)).toBe('$WORKTREE_ROOT_PATH')
    expect(await ui.find({ type: 'Text', text: 'Not set up' })).toBeDefined()
    expect((await ui.find({ key: 'save' }))?.props).toMatchObject({ dimColor: true })

    await ui.input({ key: 'script-setup', text: `npm ci # ${surface}`, kind: 'change' })
    expect((await ui.find({ key: 'save' }))?.props).toMatchObject({ dimColor: false, variant: 'primary' })

    await ui.press({ key: 'save' })
    expect(written[`${REPO}/.claude/settings.local.json`]).toContain(`create 'npm ci # ${surface}'`)
    expect((await ui.find({ key: 'save' }))?.props).toMatchObject({ dimColor: true })
    expect(await ui.find({ type: 'Text', text: 'Not set up' })).toBeUndefined()
    await ui.unmount()
  }
})
