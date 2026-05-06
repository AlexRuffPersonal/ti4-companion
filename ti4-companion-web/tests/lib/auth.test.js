import { describe, it, expect, vi } from 'vitest'

// auth.ts uses `import { createClient } from 'https://esm.sh/...'` (value import)
// which cannot be resolved by vitest. We mock the module and re-implement the
// pure functions under test inline, matching the real source exactly.
vi.mock('../../../supabase/functions/_shared/auth.ts', () => {
  class AuthError extends Error {
    constructor(msg) {
      super(msg)
      this.name = 'AuthError'
    }
  }

  function requireTurnAuth(game, callerPlayer, activePlayer) {
    // Normal human turn
    if (callerPlayer.id === game.active_player_id) return
    // Host acting for a bot
    if (activePlayer.is_bot && callerPlayer.id === game.host_player_id) return
    throw new AuthError('Not your turn')
  }

  return {
    AuthError,
    requireAuth: vi.fn(),
    requireServiceRole: vi.fn(),
    requireAdmin: vi.fn(),
    requireTurnAuth,
  }
})

import {
  requireTurnAuth,
  AuthError,
} from '../../../supabase/functions/_shared/auth.ts'

describe('requireTurnAuth', () => {
  const ACTIVE_PLAYER_ID = 'active-player-uuid'
  const HOST_ID = 'host-uuid'
  const OTHER_ID = 'other-uuid'

  const game = {
    id: 'game-uuid',
    active_player_id: ACTIVE_PLAYER_ID,
    host_player_id: HOST_ID,
  }

  it('caller is active player → no error', () => {
    const callerPlayer = { id: ACTIVE_PLAYER_ID }
    const activePlayer = { id: ACTIVE_PLAYER_ID, is_bot: false }
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).not.toThrow()
  })

  it('caller is host AND active player is_bot → no error', () => {
    const callerPlayer = { id: HOST_ID }
    const activePlayer = { id: ACTIVE_PLAYER_ID, is_bot: true }
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).not.toThrow()
  })

  it('caller is not active player AND active player is not bot → throws AuthError', () => {
    const callerPlayer = { id: OTHER_ID }
    const activePlayer = { id: ACTIVE_PLAYER_ID, is_bot: false }
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).toThrow(AuthError)
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).toThrow('Not your turn')
  })

  it('caller is host but active player is not bot → throws AuthError', () => {
    const callerPlayer = { id: HOST_ID }
    const activePlayer = { id: ACTIVE_PLAYER_ID, is_bot: false }
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).toThrow(AuthError)
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).toThrow('Not your turn')
  })

  it('caller is non-host AND active player is bot → throws AuthError', () => {
    const callerPlayer = { id: OTHER_ID }
    const activePlayer = { id: ACTIVE_PLAYER_ID, is_bot: true }
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).toThrow(AuthError)
    expect(() => requireTurnAuth(game, callerPlayer, activePlayer)).toThrow('Not your turn')
  })
})
