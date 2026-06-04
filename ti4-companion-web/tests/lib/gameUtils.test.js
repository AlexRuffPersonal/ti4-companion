import { describe, it, expect } from 'vitest'
import { deriveActivePlayer, deriveSpeaker, phaseLabel } from '../../src/lib/gameUtils.js'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', strategy_card: 1, passed: false },
  { id: 'p2', display_name: 'Bob',   strategy_card: 3, passed: false },
  { id: 'p3', display_name: 'Carol', strategy_card: 5, passed: true  },
]

describe('deriveActivePlayer', () => {
  it('returns the player matching active_player_id', () => {
    const game = { active_player_id: 'p2' }
    expect(deriveActivePlayer(PLAYERS, game)?.id).toBe('p2')
  })

  it('returns null when active_player_id is null', () => {
    expect(deriveActivePlayer(PLAYERS, { active_player_id: null })).toBeNull()
  })

  it('returns null when active_player_id is not found in players', () => {
    expect(deriveActivePlayer(PLAYERS, { active_player_id: 'unknown' })).toBeNull()
  })

  it('returns null when game is null', () => {
    expect(deriveActivePlayer(PLAYERS, null)).toBeNull()
  })

  it('returns null when players is empty', () => {
    expect(deriveActivePlayer([], { active_player_id: 'p1' })).toBeNull()
  })
})

describe('deriveSpeaker', () => {
  it('returns the player matching speaker_player_id', () => {
    const game = { speaker_player_id: 'p1' }
    expect(deriveSpeaker(PLAYERS, game)?.display_name).toBe('Alice')
  })

  it('returns null when speaker_player_id is null', () => {
    expect(deriveSpeaker(PLAYERS, { speaker_player_id: null })).toBeNull()
  })

  it('returns null when game is null', () => {
    expect(deriveSpeaker(PLAYERS, null)).toBeNull()
  })
})

describe('phaseLabel', () => {
  it('returns STRATEGY PHASE for strategy', () => {
    expect(phaseLabel('strategy')).toBe('STRATEGY PHASE')
  })

  it('returns ACTION PHASE for action', () => {
    expect(phaseLabel('action')).toBe('ACTION PHASE')
  })

  it('returns STATUS PHASE for status', () => {
    expect(phaseLabel('status')).toBe('STATUS PHASE')
  })

  it('uppercases unknown phases', () => {
    expect(phaseLabel('agenda')).toBe('AGENDA')
  })

  it('handles null gracefully', () => {
    expect(phaseLabel(null)).toBe('UNKNOWN')
  })
})

import { factionIconSlug } from '../../src/lib/gameUtils.js'

describe('factionIconSlug', () => {
  it('maps canonical faction names to icon slugs', () => {
    expect(factionIconSlug('The Arborec')).toBe('arborec')
    expect(factionIconSlug('The Barony of Letnev')).toBe('barony')
    expect(factionIconSlug('The Ghosts of Creuss')).toBe('ghosts-creuss')
    expect(factionIconSlug('The Mahact Gene-Sorcerers')).toBe('mahact')
    expect(factionIconSlug("The Vuil'raith Cabal")).toBe('vuil-raith')
  })

  it('is case-insensitive', () => {
    expect(factionIconSlug('the arborec')).toBe('arborec')
    expect(factionIconSlug('THE BARONY OF LETNEV')).toBe('barony')
  })

  it('returns null for unknown or missing values', () => {
    expect(factionIconSlug('Unknown Faction')).toBeNull()
    expect(factionIconSlug(null)).toBeNull()
    expect(factionIconSlug(undefined)).toBeNull()
  })
})
