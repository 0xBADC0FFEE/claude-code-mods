export type WorktreeScripts = { setup: string; teardown: string }

export type ScriptKind = keyof WorktreeScripts

declare module 'claude-code' {
  interface PluginState {
    'setup-worktrees': {
      root: string
      draft: WorktreeScripts
      error: string
    }
  }
}
