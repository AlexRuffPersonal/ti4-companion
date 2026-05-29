import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { resolvePromissoryHandler } from '../../../supabase/functions/_shared/promissoryHandlers.ts'

const GAME_ID = 'game-uuid'
const PLAYER_ID = 'player-uuid'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolvePromissoryHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('unknown key throws dslError with status 400', async () => {
    const ctx = {
      gameId: GAME_ID,
      activatingPlayerId: PLAYER_ID,
    }
    const db = {}

    const promise = resolvePromissoryHandler('unknownKey', ctx, db)
    await expect(promise).rejects.toThrow()
    try {
      await promise
    } catch (err) {
      expect(err.status).toBe(400)
      expect(err.message).toContain('Unknown promissory handler')
    }
  })
})
