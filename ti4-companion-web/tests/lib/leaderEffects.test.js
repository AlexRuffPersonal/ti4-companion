import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../supabase/functions/_shared/db.ts', () => ({
  db: { from: vi.fn() },
}))

import { db } from '../../../supabase/functions/_shared/db.ts'
import {
  AGENT_ABILITIES,
  HERO_ABILITIES,
  COMMANDER_PASSIVES,
  AGENT_REACTIVE_TRIGGERS,
  applyCommanderPassives,
} from '../../../supabase/functions/_shared/leaderEffects.ts'

const GAME_ID = 'game-uuid'

describe('AGENT_ABILITIES', () => {
  it('contains entries for all 24 factions', () => {
    expect(Object.keys(AGENT_ABILITIES).length).toBe(24)
  })

  it('Titans Of Ul agent has cancel_hit op', () => {
    const ability = AGENT_ABILITIES['The Titans Of Ul']
    expect(Array.isArray(ability)).toBe(true)
    expect(ability[0]).toMatchObject({ op: 'cancel_hit' })
  })

  it('Yssaril Tribes agent is a string handler key', () => {
    expect(AGENT_ABILITIES['The Yssaril Tribes']).toBe('ssruu_copies_agents')
  })
})

describe('HERO_ABILITIES', () => {
  it('contains entries for all 24 factions', () => {
    expect(Object.keys(HERO_ABILITIES).length).toBe(24)
  })

  it('Federation Of Sol hero uses reclaim_command_tokens op', () => {
    const ability = HERO_ABILITIES['The Federation Of Sol']
    expect(Array.isArray(ability)).toBe(true)
    expect(ability[0]).toMatchObject({ op: 'reclaim_command_tokens' })
  })
})

describe('AGENT_REACTIVE_TRIGGERS', () => {
  it('Ghosts Of Creuss triggers on SYSTEM_ACTIVATED', () => {
    expect(AGENT_REACTIVE_TRIGGERS['The Ghosts Of Creuss']).toContain('SYSTEM_ACTIVATED')
  })

  it('Empyrean triggers on SHIPS_MOVED', () => {
    expect(AGENT_REACTIVE_TRIGGERS['The Empyrean']).toContain('SHIPS_MOVED')
  })
})

describe('applyCommanderPassives', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty arrays when no commanders are unlocked', async () => {
    db.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 'p1', faction: 'The Titans Of Ul', leaders: { commander: 'locked' } },
          ],
          error: null,
        }),
      }),
    })

    const result = await applyCommanderPassives(
      'PRODUCTION',
      { gameId: GAME_ID, activatingPlayerId: 'p1', faction: 'The Titans Of Ul' },
      db,
    )

    expect(result.inlineEffects).toHaveLength(0)
    expect(result.pendingWindows).toHaveLength(0)
  })

  it('queues window effects for unlocked commanders with matching trigger', async () => {
    db.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 'p1', faction: 'The Titans Of Ul', leaders: { commander: 'unlocked' } },
          ],
          error: null,
        }),
      }),
    })

    // Titans Of Ul commander triggers on PRODUCTION (window mode)
    const result = await applyCommanderPassives(
      'PRODUCTION',
      { gameId: GAME_ID, activatingPlayerId: 'p1', faction: 'The Titans Of Ul' },
      db,
    )

    expect(result.inlineEffects).toHaveLength(0)
    expect(result.pendingWindows).toHaveLength(1)
    expect(result.pendingWindows[0]).toMatchObject({
      faction: 'The Titans Of Ul',
      trigger: 'PRODUCTION',
    })
  })
})
