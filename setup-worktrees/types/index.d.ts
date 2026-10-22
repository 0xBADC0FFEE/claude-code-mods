export type WorktreeScripts = { setup: string; teardown: string }

export type ScriptKind = keyof WorktreeScripts

export type SetupProgress =
  | { phase: 'idle' }
  | { phase: 'running'; step: string }
  | { phase: 'failed'; exitCode: number; step: string }

declare module 'claude-code' {
  interface PluginState {
    'setup-worktrees': {
      root: string
      draft: WorktreeScripts
      error: string
      setup: SetupProgress
      setupLog: string
      spinnerFrame: number
    }
  }
}
