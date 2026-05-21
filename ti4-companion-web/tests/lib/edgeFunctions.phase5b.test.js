import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}))

import { supabase } from '../../src/lib/supabase.js'
import { resolveAbility, unlockCommander } from '../../src/lib/edgeFunctions.js'

describe('Phase 5b edge function wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolveAbility calls game-resolve-ability with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { resolved: true }, error: null })
    await resolveAbility('g1', 'ability-uuid', 'faction_ability', null, { chosen_amount: 3 })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-resolve-ability', {
      body: {
        game_id: 'g1',
        ability_definition_id: 'ability-uuid',
        source_type: 'faction_ability',
        source_id: null,
        selections: { chosen_amount: 3 },
      },
    })
  })

  it('unlockCommander calls game-unlock-commander with game_id and leader_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { unlocked: true }, error: null })
    await unlockCommander('g1', 'leader-uuid')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-unlock-commander', {
      body: { game_id: 'g1', leader_id: 'leader-uuid' },
    })
  })
})
