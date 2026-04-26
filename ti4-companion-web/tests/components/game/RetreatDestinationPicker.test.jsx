import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RetreatDestinationPicker from '../../../src/components/game/RetreatDestinationPicker.jsx'

// Combat system '1,-1'; adjacent axial neighbors include '2,-1', '0,-1', '2,-2', '0,0', '1,0', '1,-2'
const MAP_TILES = {
  '1,-1': { tile_id: 'tile-a' },
  '2,-1': { tile_id: 'tile-b' },   // adjacent, has friendly units
  '0,-1': { tile_id: 'tile-c' },   // adjacent, no friendly presence
  '9,9':  { tile_id: 'tile-z' },   // not adjacent
}

const TILE_DATA = {
  'tile-a': { planets: [], type: 'blue', wormhole: null },
  'tile-b': { planets: [{ name: 'Wellon' }], type: 'blue', wormhole: null },
  'tile-c': { planets: [], type: 'blue', wormhole: null },
  'tile-z': { planets: [], type: 'blue', wormhole: null },
}

const PLAYER_ID = 'p1'

const SYSTEM_UNITS = [
  { id: 'u1', player_id: PLAYER_ID, system_key: '2,-1', unit_type: 'carrier', count: 1, on_planet: null },
]

const ALL_PLANETS = []

const BASE_PROPS = {
  combatSystemKey: '1,-1',
  mapTiles: MAP_TILES,
  tileData: TILE_DATA,
  systemUnits: SYSTEM_UNITS,
  allPlanets: ALL_PLANETS,
  retreatingPlayerId: PLAYER_ID,
  onSelect: vi.fn(),
  onCancel: vi.fn(),
}

describe('RetreatDestinationPicker', () => {
  it('renders a list of valid adjacent systems with presence', () => {
    render(<RetreatDestinationPicker {...BASE_PROPS} />)
    expect(screen.getByText('2,-1')).toBeInTheDocument()
  })

  it('does not show non-adjacent systems', () => {
    render(<RetreatDestinationPicker {...BASE_PROPS} />)
    expect(screen.queryByText('9,9')).not.toBeInTheDocument()
  })

  it('does not show adjacent systems without friendly presence', () => {
    render(<RetreatDestinationPicker {...BASE_PROPS} />)
    expect(screen.queryByText('0,-1')).not.toBeInTheDocument()
  })

  it('calls onSelect with the system key when a destination is clicked', () => {
    const onSelect = vi.fn()
    render(<RetreatDestinationPicker {...BASE_PROPS} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('2,-1'))
    expect(onSelect).toHaveBeenCalledWith('2,-1')
  })

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn()
    render(<RetreatDestinationPicker {...BASE_PROPS} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows empty state message when no valid destinations', () => {
    render(<RetreatDestinationPicker {...BASE_PROPS} systemUnits={[]} allPlanets={[]} />)
    expect(screen.getByText(/no valid retreat/i)).toBeInTheDocument()
  })
})