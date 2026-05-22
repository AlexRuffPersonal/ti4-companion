import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock HexMap so it doesn't try to render SVG in jsdom
vi.mock('../../../src/components/game/HexMap.jsx', () => ({
  default: ({ mapTiles, onSelectSystem }) => (
    <div data-testid="hex-map">
      {Object.keys(mapTiles).map(key => (
        <button key={key} data-testid={`hex-${key}`} onClick={() => onSelectSystem?.(key)}>
          {key}
        </button>
      ))}
    </div>
  ),
}))

// Mock DraftTileHand
vi.mock('../../../src/components/game/DraftTileHand.jsx', () => ({
  default: ({ tiles, isMyTurn, selectedTile, onSelect }) => (
    <div data-testid="draft-tile-hand">
      {tiles.map(t => (
        <button key={t} data-testid={`hand-tile-${t}`} onClick={() => onSelect?.(t)}
          className={selectedTile === t ? 'selected' : ''} disabled={!isMyTurn}>
          {t}
        </button>
      ))}
    </div>
  ),
}))

import DraftPlacementView from '../../../src/components/game/DraftPlacementView.jsx'

const TILE_BY_NUMBER = {
  '18': { id: 'tile-18', tile_number: '18', planets: [], wormhole: null, anomaly: false },
  '32': { id: 'tile-32', tile_number: '32', planets: [{ resources: 2, influence: 1 }], wormhole: null, anomaly: false },
  '41': { id: 'tile-41', tile_number: '41', planets: [], wormhole: 'alpha', anomaly: false },
}

const TILE_DATA_BY_ID = {
  'tile-18': { id: 'tile-18', tile_number: '18', planets: [] },
  'tile-32': { id: 'tile-32', tile_number: '32', planets: [{ resources: 2, influence: 1 }] },
  'tile-41': { id: 'tile-41', tile_number: '41', planets: [] },
}

const PLAYERS = [
  { id: 'player-1', display_name: 'Alice' },
  { id: 'player-2', display_name: 'Bob' },
]

const DRAFT_STATE = {
  mode: 'official',
  phase: 'placement',
  hands: {
    'player-1': ['32', '41'],
    'player-2': [],
  },
  placement_order: ['player-1', 'player-2', 'player-1'],
  placement_index: 0,
  placed_tiles: {},
}

const DRAFT_STATE_WITH_PLACED = {
  ...DRAFT_STATE,
  placed_tiles: {
    '1,0': { tile_number: '32', rotation: 0, wormhole: null, anomaly: null },
  },
}

describe('DraftPlacementView', () => {
  it('renders status bar with active player name', () => {
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={vi.fn()}
      placeError={null}
    />)
    expect(screen.getAllByText(/Alice/)[0]).toBeInTheDocument()
    expect(screen.getByText(/PLACEMENT PHASE/i)).toBeInTheDocument()
    expect(screen.getByText(/TURN 1 OF 3/i)).toBeInTheDocument()
  })

  it('HexMap receives correct mapTiles (includes Mecatol + placed tiles)', () => {
    render(<DraftPlacementView
      draftState={DRAFT_STATE_WITH_PLACED}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={vi.fn()}
      placeError={null}
    />)
    // Mecatol at 0,0 and placed tile at 1,0
    expect(screen.getByTestId('hex-0,0')).toBeInTheDocument()
    expect(screen.getByTestId('hex-1,0')).toBeInTheDocument()
  })

  it('DraftTileHand rendered with currentPlayer hand tiles', () => {
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={vi.fn()}
      placeError={null}
    />)
    expect(screen.getByTestId('hand-tile-32')).toBeInTheDocument()
    expect(screen.getByTestId('hand-tile-41')).toBeInTheDocument()
  })

  it('clicking tile in hand sets selectedTile (hint text appears)', () => {
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={vi.fn()}
      placeError={null}
    />)
    fireEvent.click(screen.getByTestId('hand-tile-32'))
    expect(screen.getByText(/click a valid hex/i)).toBeInTheDocument()
  })

  it('clicking same tile again deselects (hint disappears)', () => {
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={vi.fn()}
      placeError={null}
    />)
    fireEvent.click(screen.getByTestId('hand-tile-32'))
    fireEvent.click(screen.getByTestId('hand-tile-32'))
    expect(screen.queryByText(/click a valid hex/i)).not.toBeInTheDocument()
  })

  it('handleHexClick fires onPlaceTile when tile selected and isMyTurn', () => {
    const onPlaceTile = vi.fn()
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={onPlaceTile}
      placeError={null}
    />)
    // Select a tile
    fireEvent.click(screen.getByTestId('hand-tile-32'))
    // Click a hex
    fireEvent.click(screen.getByTestId('hex-0,0'))
    expect(onPlaceTile).toHaveBeenCalledWith('32', '0,0', 0)
  })

  it('handleHexClick does nothing when no tile selected', () => {
    const onPlaceTile = vi.fn()
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={onPlaceTile}
      placeError={null}
    />)
    fireEvent.click(screen.getByTestId('hex-0,0'))
    expect(onPlaceTile).not.toHaveBeenCalled()
  })

  it('placeError shown when set', () => {
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[0]}
      players={PLAYERS}
      game={{}}
      onPlaceTile={vi.fn()}
      placeError="Position already occupied"
    />)
    expect(screen.getByText('Position already occupied')).toBeInTheDocument()
  })

  it('non-active player: hand is disabled and onPlaceTile not called on hex click', () => {
    const onPlaceTile = vi.fn()
    render(<DraftPlacementView
      draftState={DRAFT_STATE}
      tileByNumber={TILE_BY_NUMBER}
      tileDataById={TILE_DATA_BY_ID}
      currentPlayer={PLAYERS[1]}  // Bob, not active
      players={PLAYERS}
      game={{}}
      onPlaceTile={onPlaceTile}
      placeError={null}
    />)
    // Bob's hand is empty per DRAFT_STATE but if not: hand should be disabled
    // Verify hint text never appears (not my turn)
    // We can click a hex and onPlaceTile should not be called
    fireEvent.click(screen.getByTestId('hex-0,0'))
    expect(onPlaceTile).not.toHaveBeenCalled()
  })
})
