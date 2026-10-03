import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

const TOKENS_WARN = 100_000
const TOKENS_CRIT = 150_000
const GREEN = '#4eba65'
const YELLOW = '#ffc107'
const RED = '#e5484d'

const usedTokens = atom({ plugin: 'context-tokens', key: 'tokens' } as const, null)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refreshTokens($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await refreshTokens($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refreshTokens($)
    return result
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const tokens = await read($, usedTokens)
    if (tokens === null) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const modes = e.props.modes.join(' & ')

    return (
      <Box>
        <Text color={tokensColor(tokens)}>{formatTokens(tokens)}</Text>
        {modes && <Text dimColor> • {modes}</Text>}
      </Box>
    )
  })
}

async function refreshTokens($: EngineInterface): Promise<void> {
  const { context } = await $.session.usage()
  await update($, usedTokens, () => context.tokens ?? null)
}

function tokensColor(tokens: number): string {
  if (tokens >= TOKENS_CRIT) return RED
  if (tokens >= TOKENS_WARN) return YELLOW
  return GREEN
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`
  return String(tokens)
}
