import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CombatModal from '../../../src/components/game/CombatModal.jsx'

vi.mock('../../../src/components/game/FleetDisplay.jsx', () => ({
  default: ({ units, isInteractive, hitsToAssign, onConfirm }) => (
    <div data-testid={`fleet-${isInteractive ? 'interactive' : 'passive'}`}>
      {units.map(u => <span key={u.id}>{u.unit_type}</span>)}
      {isInteractive && (
        <button onClick={() => onConfirm([{ unit_type: 'fighter', player_unit_id: 'u1', action: 'destroy' }])}>
          Confirm
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../../src/components/game/DiceResultsPanel.jsx', () => ({
  default: ({ dice, label }) => dice ? <div data-testid="dice-results">{label}</div> : null,
}))

vi.mock('../../../src/components/game/RetreatDestinationPicker.jsx', () => ({
  default: ({ onSelect, onCancel }) => (
    <div data-testid="retreat-picker">
      <button onClick={() => onSelect('2,-1')}>Pick 2,-1</button>
      <button onClick={onCancel}>Cancel Retreat</button>
    </div>
  ),
}))

const ATTACKER_ID = 'p1'
const DEFENDER_ID = 'p2'

const PLAYERS = [
  { id: ATTACKER_ID, display_name: 'Alice', colour: '#22c55e' },
  { id: DEFENDER_ID, display_name: 'Bob', colour: '#ef4444' },
]

const BASE_COMBAT = {
  id: 'c1', system_key: '1,-1', round: 1, status: 'active',
  attacker_player_id: ATTACKER_ID, defender_player_id: DEFENDER_ID,
  phase: 'attacker_roll',
  attacker_dice: null, defender_dice: null,
  attacker_hits: 0, defender_hits: 0,
  retreat_declared_by: null, winner_player_id: null,
}

const ATK_UNITS = [{ id: 'u1', player_id: ATTACKER_ID, unit_type: 'cruiser', count: 2, damaged: false, system_key: '1,-1', on_planet: null }]
const DEF_UNITS = [{ id: 'u2', player_id: DEFENDER_ID, unit_type: 'carrier', count: 1, damaged: false, system_key: '1,-1', on_planet: null }]

const BASE_PROPS = {
  combat: BASE_COMBAT,
  myPlayerId: ATTACKER_ID,
  players: PLAYERS,
  systemUnits: [...ATK_UNITS, ...DEF_UNITS],
  mapTiles: { '1,-1': { tile_id: 't1' }, '2,-1': { tile_id: 't2' } },
  tileData: {},
  allPlanets: [],
  onRollDice: vi.fn(),
  onAssignHits: vi.fn(),
  onDeclareRetreat: vi.fn(),
}

describe('CombatModal', () => {
  it('shows system key and round', () => {
    render(<CombatModal {...BASE_PROPS} />)
    expect(screen.getByText(/1,-1/)).toBeInTheDocument()
    expect(screen.getByText(/round 1/i)).toBeInTheDocument()
  })

  it('shows attacker and defender player names', () => {
    render(<CombatModal {...BASE_PROPS} />)
    expect(screen.getByText(/alice/i)).toBeInTheDocument()
    expect(screen.getByText(/bob/i)).toBeInTheDocument()
  })

  it('renders both FleetDisplay components', () => {
    render(<CombatModal {...BASE_PROPS} />)
    expect(screen.getAllByTestId(/fleet-/)).toHaveLength(2)
  })

  it('shows Roll Dice button when it is the current player\'s roll phase', () => {
    render(<CombatModal {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /roll dice/i })).toBeInTheDocument()
  })

  it('does not show Roll Dice button when it is not the current player\'s roll phase', () => {
    render(<CombatModal {...BASE_PROPS} myPlayerId={DEFENDER_ID} />)
    expect(screen.queryByRole('button', { name: /roll dice/i })).not.toBeInTheDocument()
  })

  it('calls onRollDice when Roll Dice is clicked', () => {
    const onRollDice = vi.fn()
    render(<CombatModal {...BASE_PROPS} onRollDice={onRollDice} />)
    fireEvent.click(screen.getByRole('button', { name: /roll dice/i }))
    expect(onRollDice).toHaveBeenCalled()
  })

  it('makes defender fleet interactive during defender_assign with correct hits', () => {
    render(<CombatModal {...BASE_PROPS} combat={{ ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 2 }} myPlayerId={DEFENDER_ID} />)
    expect(screen.getByTestId('fleet-interactive')).toBeInTheDocument()
  })

  it('calls onAssignHits when FleetDisplay confirms', () => {
    const onAssignHits = vi.fn()
    render(<CombatModal {...BASE_PROPS} combat={{ ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 }} myPlayerId={DEFENDER_ID} onAssignHits={onAssignHits} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onAssignHits).toHaveBeenCalled()
  })

  it('shows Declare Retreat button during roll phases', () => {
    render(<CombatModal {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /declare retreat/i })).toBeInTheDocument()
  })

  it('shows RetreatDestinationPicker when Declare Retreat clicked', () => {
    render(<CombatModal {...BASE_PROPS} />)
    fireEvent.click(screen.getByRole('button', { name: /declare retreat/i }))
    expect(screen.getByTestId('retreat-picker')).toBeInTheDocument()
  })

  it('calls onDeclareRetreat when destination selected', () => {
    const onDeclareRetreat = vi.fn()
    render(<CombatModal {...BASE_PROPS} onDeclareRetreat={onDeclareRetreat} />)
    fireEvent.click(screen.getByRole('button', { name: /declare retreat/i }))
    fireEvent.click(screen.getByText('Pick 2,-1'))
    expect(onDeclareRetreat).toHaveBeenCalledWith('2,-1')
  })

  it('shows result screen when combat is complete with winner', () => {
    render(<CombatModal {...BASE_PROPS} combat={{ ...BASE_COMBAT, status: 'complete', winner_player_id: ATTACKER_ID }} />)
    expect(screen.getByText(/alice/i)).toBeInTheDocument()
    expect(screen.getByText(/wins/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('calls onClose when Close is clicked on result screen', () => {
    const onClose = vi.fn()
    render(<CombatModal {...BASE_PROPS} combat={{ ...BASE_COMBAT, status: 'complete', winner_player_id: ATTACKER_ID }} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })
})