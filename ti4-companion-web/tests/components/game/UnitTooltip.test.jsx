import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UnitTooltip from '../../../src/components/game/UnitTooltip.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice', colour: '#22c55e' },
  { id: 'p2', display_name: 'Bob', colour: '#ef4444' },
]

const TILE_INFO = {
  planets: [{ name: 'Mecatol Rex' }, { name: 'Wellon' }],
}

describe('UnitTooltip', () => {
  it('renders Space Area section when units are in space', () => {
    const units = [
      { player_id: 'p1', unit_type: 'carrier', count: 2, system_key: '0,0', on_planet: null },
      { player_id: 'p2', unit_type: 'destroyer', count: 1, system_key: '0,0', on_planet: null },
    ]
    render(<UnitTooltip units={units} tileInfo={TILE_INFO} players={PLAYERS} />)
    expect(screen.getByText('Space Area')).toBeInTheDocument()
    expect(screen.getByText('2C')).toBeInTheDocument()
    expect(screen.getByText('1D')).toBeInTheDocument()
  })

  it('renders planet section when units are on a planet', () => {
    const units = [
      { player_id: 'p1', unit_type: 'infantry', count: 3, system_key: '0,0', on_planet: 'Mecatol Rex' },
    ]
    render(<UnitTooltip units={units} tileInfo={TILE_INFO} players={PLAYERS} />)
    expect(screen.getByText('Mecatol Rex')).toBeInTheDocument()
    expect(screen.getByText('3I')).toBeInTheDocument()
  })

  it('does not render Space Area section when no space units', () => {
    const units = [
      { player_id: 'p1', unit_type: 'infantry', count: 1, system_key: '0,0', on_planet: 'Wellon' },
    ]
    render(<UnitTooltip units={units} tileInfo={TILE_INFO} players={PLAYERS} />)
    expect(screen.queryByText('Space Area')).not.toBeInTheDocument()
  })

  it('does not render section for planet with no units', () => {
    const units = [
      { player_id: 'p1', unit_type: 'infantry', count: 1, system_key: '0,0', on_planet: 'Mecatol Rex' },
    ]
    render(<UnitTooltip units={units} tileInfo={TILE_INFO} players={PLAYERS} />)
    expect(screen.queryByText('Wellon')).not.toBeInTheDocument()
  })

  it('renders No units when units array is empty', () => {
    render(<UnitTooltip units={[]} tileInfo={TILE_INFO} players={PLAYERS} />)
    expect(screen.getByText('No units')).toBeInTheDocument()
  })

  it('uses correct abbreviation for pds', () => {
    const units = [{ player_id: 'p1', unit_type: 'pds', count: 1, system_key: '0,0', on_planet: 'Wellon' }]
    render(<UnitTooltip units={units} tileInfo={TILE_INFO} players={PLAYERS} />)
    expect(screen.getByText('1P')).toBeInTheDocument()
  })
})
