import { describe, it, expect, vi } from 'vitest'

// db.ts uses Deno globals at module level — stub it out before importing auth.ts
vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { requireTurnAuth, AuthError } from '../../../supabase/functions/_shared/auth.ts'

const GAME = { active_player_id: 'p1', host_user_id: 'host-uid' }

describe('requireTurnAuth', () => {
  it('does not throw when caller is the active player', () => {
    const caller = { id: 'p1', user_id: 'p1-uid' }
    const active = { id: 'p1', is_bot: false }
    expect(() => requireTurnAuth(GAME, caller, active)).not.toThrow()
  })

  it('does not throw when caller is host and active player is a bot', () => {
    const caller = { id: 'host-pid', user_id: 'host-uid' }
    const active = { id: 'bot1', is_bot: true }
    expect(() => requireTurnAuth(GAME, caller, active)).not.toThrow()
  })

  it('throws AuthError(403) when caller is not active player and active player is not a bot', () => {
    const caller = { id: 'p2', user_id: 'p2-uid' }
    const active = { id: 'p1', is_bot: false }
    let thrown
    try {
      requireTurnAuth(GAME, caller, active)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(AuthError)
    expect(thrown.status).toBe(403)
    expect(thrown.message).toBe('Not your turn')
  })

  it('throws AuthError(403) when caller is host but active player is not a bot', () => {
    const caller = { id: 'host-pid', user_id: 'host-uid' }
    const active = { id: 'p1', is_bot: false }
    let thrown
    try {
      requireTurnAuth(GAME, caller, active)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(AuthError)
    expect(thrown.status).toBe(403)
  })

  it('throws AuthError(403) when caller is non-host and active player is a bot', () => {
    const caller = { id: 'p2', user_id: 'p2-uid' }
    const active = { id: 'bot1', is_bot: true }
    let thrown
    try {
      requireTurnAuth(GAME, caller, active)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(AuthError)
    expect(thrown.status).toBe(403)
  })
})
