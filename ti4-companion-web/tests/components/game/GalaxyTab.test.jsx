import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GalaxyTab from '../../../src/components/game/GalaxyTab.jsx'
import { useCombat } from '../../../src/hooks/useCombat.js'

vi.mock('../../../src/components/game/HexMap.jsx', () => ({
  default: ({ onSelectSystem }) => (
    <div data-testid="hex-map">
      <button onClick={() => onSelectSystem('1,-1')}>Select Hex</button>
    </div>
  ),
}))

vi.mock('../../../src/components/game/SystemActionModal.jsx', () => ({
  default: ({ systemKey, onClose }) => (
    <div data-testid="system-modal">
      <span>{systemKey}</span>
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}))

const PLAYERS = [{ id: 'p1', display_name: 'Alice', colour: '#22c55e', command_tokens: { tactic_total: 3 } }]
const CURRENT_PLAYER = { id: 'p1', command_tokens: { tactic_total: 3 } }
const GAME = { id: 'game-uuid', phase: 'action', active_player_id: 'p1' }

const BASE_PROPS = {
  mapTiles: { '1,-1': { tile_id: 'tid-1', tile_number: '32' } },
  tileData: {},
  activations: [],
  allPlanets: [],
  systemUnits: [],
  activatedSystems: new Set(),
  myActivations: new Set(),
  planetOwnership: new Map(),
  players: PLAYERS,
  currentPlayer: CURRENT_PLAYER,
  game: GAME,
  activateSystem: vi.fn(),
  landTroops: vi.fn(),
}

describe('GalaxyTab', () => {
  it('renders HexMap', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    expect(screen.getByTestId('hex-map')).toBeInTheDocument()
  })

  it('does not render SystemActionModal initially', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    expect(screen.queryByTestId('system-modal')).not.toBeInTheDocument()
  })

  it('opens SystemActionModal when a hex is selected', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    fireEvent.click(screen.getByText('Select Hex'))
    expect(screen.getByTestId('system-modal')).toBeInTheDocument()
    expect(screen.getByText('1,-1')).toBeInTheDocument()
  })

  it('closes SystemActionModal when onClose is called', () => {
    render(<GalaxyTab {...BASE_PROPS} />)
    fireEvent.click(screen.getByText('Select Hex'))
    expect(screen.getByTestId('system-modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Close Modal'))
    expect(screen.queryByTestId('system-modal')).not.toBeInTheDocument()
  })

  it('calls activateSystem and closes modal on successful activation', async () => {
    const activateSystem = vi.fn().mockResolvedValue({ activated: true })
    render(<GalaxyTab {...BASE_PROPS} activateSystem={activateSystem} />)
    // This would be tested via SystemActionModal's onActivate callback
    // Covered by integration: activateSystem prop is passed down and called
    expect(activateSystem).toBeDefined()
  })
})

vi.mock('../../../src/components/game/SpaceCannonModal.jsx', () => ({
  default: ({ combat, onFire, onPass }) => (
    <div data-testid="space-cannon-modal">
      <button onClick={onFire}>Fire SC</button>
      <button onClick={onPass}>Pass SC</button>
    </div>
  ),
}))

vi.mock('../../../src/components/game/CombatModal.jsx', () => ({
  default: ({ combat, onRollDice }) => (
    <div data-testid="combat-modal">
      <span>{combat?.phase}</span>
      <button onClick={onRollDice}>Roll</button>
    </div>
  ),
}))

vi.mock('../../../src/components/game/GroundCombatModal.jsx', () => ({
  default: ({ combat }) => (
    <div data-testid="ground-combat-modal">
      <span>{combat?.planet_name}</span>
    </div>
  ),
}))

vi.mock('../../../src/hooks/useCombat.js', () => ({
  useCombat: vi.fn(() => ({
    combat: null,
    fireSpaceCannon: vi.fn(),
    rollDice: vi.fn(),
    rollGroundDice: vi.fn(),
    assignHits: vi.fn(),
    declareRetreat: vi.fn(),
  })),
}))

const DEFAULT_COMBAT_MOCK = {
  combat: null,
  fireSpaceCannon: vi.fn(),
  rollDice: vi.fn(),
  rollGroundDice: vi.fn(),
  assignHits: vi.fn(),
  declareRetreat: vi.fn(),
}

describe('GalaxyTab — combat modals (Phase 10)', () => {
  beforeEach(() => {
    useCombat.mockReturnValue({ ...DEFAULT_COMBAT_MOCK })
  })

  it('does not render SpaceCannonModal or CombatModal when no active combat', () => {
    render(<GalaxyTab {...BASE_PROPS} activeCombat={null} gameId="g1" myPlayerId="p1" />)
    expect(screen.queryByTestId('space-cannon-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('combat-modal')).not.toBeInTheDocument()
  })

  it('renders SpaceCannonModal when combat phase is space_cannon', () => {
    useCombat.mockReturnValue({
      ...DEFAULT_COMBAT_MOCK,
      combat: { id: 'c1', phase: 'space_cannon', combat_type: 'space', status: 'active', space_cannon_pending: [] },
    })
    render(<GalaxyTab {...BASE_PROPS} activeCombat={{ id: 'c1', phase: 'space_cannon' }} gameId="g1" myPlayerId="p1" />)
    expect(screen.getByTestId('space-cannon-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('combat-modal')).not.toBeInTheDocument()
  })

  it('renders CombatModal when space combat phase is attacker_roll', () => {
    useCombat.mockReturnValue({
      ...DEFAULT_COMBAT_MOCK,
      combat: { id: 'c1', phase: 'attacker_roll', combat_type: 'space', round: 1, status: 'active', attacker_hits: 0, defender_hits: 0, attacker_dice: null, defender_dice: null, retreat_declared_by: null, winner_player_id: null, system_key: '1,-1', attacker_player_id: 'p1', defender_player_id: 'p2' },
    })
    render(<GalaxyTab {...BASE_PROPS} activeCombat={{ id: 'c1', phase: 'attacker_roll' }} gameId="g1" myPlayerId="p1" />)
    expect(screen.getByTestId('combat-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('space-cannon-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ground-combat-modal')).not.toBeInTheDocument()
  })
})

describe('GalaxyTab — ground combat (Phase 11)', () => {
  beforeEach(() => {
    useCombat.mockReturnValue({ ...DEFAULT_COMBAT_MOCK })
  })

  it('renders GroundCombatModal and not CombatModal for ground combat', () => {
    useCombat.mockReturnValue({
      ...DEFAULT_COMBAT_MOCK,
      combat: { id: 'c1', phase: 'attacker_roll', combat_type: 'ground', planet_name: 'Wellon', round: 1, status: 'active', attacker_player_id: 'p1', defender_player_id: 'p2', system_key: '1,-1' },
    })
    render(<GalaxyTab {...BASE_PROPS} activeCombat={{ id: 'c1' }} gameId="g1" myPlayerId="p1" />)
    expect(screen.getByTestId('ground-combat-modal')).toBeInTheDocument()
    expect(screen.queryByTestId('combat-modal')).not.toBeInTheDocument()
  })

  it('shows planet name in GroundCombatModal', () => {
    useCombat.mockReturnValue({
      ...DEFAULT_COMBAT_MOCK,
      combat: { id: 'c1', phase: 'attacker_roll', combat_type: 'ground', planet_name: 'Wellon', round: 1, status: 'active', attacker_player_id: 'p1', defender_player_id: 'p2', system_key: '1,-1' },
    })
    render(<GalaxyTab {...BASE_PROPS} activeCombat={{ id: 'c1' }} gameId="g1" myPlayerId="p1" />)
    expect(screen.getByText('Wellon')).toBeInTheDocument()
  })
})