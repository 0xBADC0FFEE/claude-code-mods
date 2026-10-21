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

test('edits a script and saves it with the one Save button', async ($, on) => {
  const written: Record<string, string> = {}
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'setup-worktrees' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.root', () => ({ value: REPO }))
  on('env.get', () => ({ value: '/home' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${REPO}/.git\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('fs.exists', (_, e) => ({ value: e.path in written }))
  on('fs.read', (_, e) => ({ value: written[e.path] ?? '#!/usr/bin/env bash' }))
  on('fs.write', (_, e) => {
    written[e.path] = e.text
    return { value: undefined }
  })

  await $.session.start({ cwd: REPO, surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    for (const path of Object.keys(written)) delete written[path]
    await $.command.run({ command: 'setup-worktrees', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.findAll({ type: 'Button' })).toHaveLength(1)
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
