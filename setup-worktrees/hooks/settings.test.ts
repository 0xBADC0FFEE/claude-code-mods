import { expect, test } from 'claude-code/testing'

import { readWorktreeScripts, withWorktreeHooks } from './settings'

test('reads back scripts holding quotes and newlines', async () => {
  const scripts = { setup: "cp ../.env .\necho 'ready'", teardown: '' }

  expect(readWorktreeScripts(withWorktreeHooks({}, scripts))).toEqual(scripts)
})

test('keeps unrelated settings and hooks', async () => {
  const settings = { permissions: { allow: ['Bash(ls)'] }, hooks: { Stop: [] } }

  const saved = withWorktreeHooks(settings, { setup: 'make', teardown: 'make clean' })

  expect(saved.permissions).toEqual(settings.permissions)
  expect(saved.hooks?.Stop).toEqual([])
})

test('ignores worktree hooks it did not write', async () => {
  const foreign = { hooks: { WorktreeCreate: [{ hooks: [{ type: 'command', command: 'my-hook.sh' }] }] } }

  expect(readWorktreeScripts(foreign)).toBeUndefined()
})
