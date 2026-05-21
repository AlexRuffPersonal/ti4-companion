import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

import { supabase } from '../../src/lib/supabase.js'
import {
  importTable,
  moveShips,
  updateRecord,
  rollRiftDice,
  playActionCard,
  passActionWindow,
  fireAntiFighterBarrage,
  advanceBarrage,
  fireBombardment,
  advanceBombardment,
  commitGroundForces,
  fireSpaceCannonDefense,
  explorePlanet,
  resolveExplorationCard,
  exploreFrontier,
  useRelicFragment,
  useRelic,
  playCombatActionCard,
  exhaustLegendaryCard,
  exhaustTechnology,
  readyTechnology,
  useTechnologyAction,
  addBot,
  removeBot,
  undoLastAction,
} from '../../src/lib/edgeFunctions.js'

describe('importTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct edge function with records payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { imported: 3 }, error: null })
    const records = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    const result = await importTable('tiles', records)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-import-tiles', {
      body: { records },
    })
    expect(result).toEqual({ imported: 3 })
  })

  it('throws when the edge function returns an error', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'Forbidden' } })
    await expect(importTable('factions', [])).rejects.toThrow('Forbidden')
  })
})

describe('moveShips', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-move-ships with game_id and spread payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const payload = { system_key: '1,0', unit_ids: ['u1'] }
    await moveShips('game-1', payload)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-move-ships', {
      body: { game_id: 'game-1', system_key: '1,0', unit_ids: ['u1'] },
    })
  })
})

describe('updateRecord', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls admin-update-record with table and record', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { updated: 1 }, error: null })
    const record = { id: 'rec-1', name: 'Test' }
    await updateRecord('factions', record)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-update-record', {
      body: { table: 'factions', record },
    })
  })
})

describe('rollRiftDice', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-roll-rift-dice with transit_id, roll_all, unit_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { rolls: [3] }, error: null })
    await rollRiftDice('transit-1', false, 'unit-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-roll-rift-dice', {
      body: { transit_id: 'transit-1', roll_all: false, unit_id: 'unit-1' },
    })
  })
})

describe('playActionCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-play-action-card with game_id, card_id, selections', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const selections = { target_player_id: 'p2' }
    await playActionCard('game-1', 'card-1', selections)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-action-card', {
      body: { game_id: 'game-1', card_id: 'card-1', selections },
    })
  })
})

describe('passActionWindow', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-pass-action-window with game_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await passActionWindow('game-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-pass-action-window', {
      body: { game_id: 'game-1' },
    })
  })
})

describe('fireAntiFighterBarrage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-fire-anti-fighter-barrage with game_id and combat_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await fireAntiFighterBarrage('game-1', 'combat-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-fire-anti-fighter-barrage', {
      body: { game_id: 'game-1', combat_id: 'combat-1' },
    })
  })
})

describe('advanceBarrage', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-advance-barrage with game_id and combat_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await advanceBarrage('game-1', 'combat-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-advance-barrage', {
      body: { game_id: 'game-1', combat_id: 'combat-1' },
    })
  })
})

describe('fireBombardment', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-fire-bombardment with game_id, system_key, planet_name', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await fireBombardment('game-1', '1,0', 'Mecatol Rex')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-fire-bombardment', {
      body: { game_id: 'game-1', system_key: '1,0', planet_name: 'Mecatol Rex' },
    })
  })
})

describe('advanceBombardment', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-advance-bombardment with game_id and system_key', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await advanceBombardment('game-1', '1,0')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-advance-bombardment', {
      body: { game_id: 'game-1', system_key: '1,0' },
    })
  })
})

describe('commitGroundForces', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-commit-ground-forces with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await commitGroundForces('game-1', '1,0', 'Mecatol Rex', 3)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-commit-ground-forces', {
      body: { game_id: 'game-1', system_key: '1,0', planet_name: 'Mecatol Rex', troop_count: 3 },
    })
  })
})

describe('fireSpaceCannonDefense', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-fire-space-cannon-defense with game_id and combat_id', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await fireSpaceCannonDefense('game-1', 'combat-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-fire-space-cannon-defense', {
      body: { game_id: 'game-1', combat_id: 'combat-1' },
    })
  })
})

describe('explorePlanet', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-explore-planet with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await explorePlanet('game-1', 'player-1', 'Wellon', 'cultural')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-explore-planet', {
      body: { game_id: 'game-1', player_id: 'player-1', planet_name: 'Wellon', deck_type: 'cultural' },
    })
  })
})

describe('resolveExplorationCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-resolve-exploration-card with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await resolveExplorationCard('game-1', 'player-1', 'card-1', { keep: true })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-resolve-exploration-card', {
      body: { game_id: 'game-1', player_id: 'player-1', card_id: 'card-1', keep: true },
    })
  })

  it('spreads opts into body', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await resolveExplorationCard('game-1', 'player-1', 'card-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-resolve-exploration-card', {
      body: { game_id: 'game-1', player_id: 'player-1', card_id: 'card-1' },
    })
  })
})

describe('exploreFrontier', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-explore-frontier with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await exploreFrontier('game-1', 'player-1', '2,1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-explore-frontier', {
      body: { game_id: 'game-1', player_id: 'player-1', system_key: '2,1' },
    })
  })
})

describe('useRelicFragment', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-use-relic-fragment with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await useRelicFragment('game-1', 'player-1', ['frag-1', 'frag-2'])
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-use-relic-fragment', {
      body: { game_id: 'game-1', player_id: 'player-1', fragment_ids: ['frag-1', 'frag-2'] },
    })
  })
})

describe('useRelic', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-use-relic with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await useRelic('game-1', 'player-1', 'relic-shard', { choice: 0, useType: 'explore' })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-use-relic', {
      body: {
        game_id: 'game-1',
        player_id: 'player-1',
        relic_id: 'relic-shard',
        choice: 0,
        use_type: 'explore',
        planet_name: undefined,
        deck_type: undefined,
        card_ids: undefined,
        technology_name: undefined,
      },
    })
  })
})

describe('playCombatActionCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-play-combat-action-card with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await playCombatActionCard('game-1', 'combat-1', 'card-1', ['unit-1'])
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-play-combat-action-card', {
      body: { game_id: 'game-1', combat_id: 'combat-1', card_id: 'card-1', targets: ['unit-1'] },
    })
  })
})

describe('exhaustLegendaryCard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-resolve-ability with legendary_card source_type', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await exhaustLegendaryCard('game-1', 'Mecatol Rex', 'draw_card')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-resolve-ability', {
      body: {
        game_id: 'game-1',
        source_type: 'legendary_card',
        source_id: 'Mecatol Rex',
        selections: { choice: 'draw_card' },
      },
    })
  })
})

describe('exhaustTechnology', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-exhaust-technology with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await exhaustTechnology('game-1', 'Graviton Laser System')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-exhaust-technology', {
      body: { game_id: 'game-1', technology_name: 'Graviton Laser System' },
    })
  })
})

describe('readyTechnology', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-ready-technology with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await readyTechnology('game-1', 'Bio-Stims')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-ready-technology', {
      body: { game_id: 'game-1', technology_name: 'Bio-Stims' },
    })
  })
})

describe('useTechnologyAction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-use-technology-action with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    const selections = { target: 'player-2' }
    await useTechnologyAction('game-1', 'Scanlink Drone Network', selections)
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-use-technology-action', {
      body: { game_id: 'game-1', technology_name: 'Scanlink Drone Network', selections },
    })
  })
})

describe('addBot', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-add-bot with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await addBot('game-1', 'Bot Alpha', 'Sol', 'blue', 'random')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-add-bot', {
      body: { game_id: 'game-1', display_name: 'Bot Alpha', faction: 'Sol', color: 'blue', bot_strategy: 'random' },
    })
  })
})

describe('removeBot', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-remove-bot with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await removeBot('game-1', 'bot-player-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-remove-bot', {
      body: { game_id: 'game-1', bot_player_id: 'bot-player-1' },
    })
  })
})

describe('undoLastAction', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('calls game-undo with correct payload', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null })
    await undoLastAction('game-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('game-undo', {
      body: { game_id: 'game-1' },
    })
  })
})
