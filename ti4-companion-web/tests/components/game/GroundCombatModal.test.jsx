import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GroundCombatModal from '../../../src/components/game/GroundCombatModal.jsx'

vi.mock('../../../src/lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      then: vi.fn((cb) => cb({ data: [] })),
    })),
  },
}))

vi.mock('../../../src/components/game/FleetDisplay.jsx', () => ({
  default: ({ units, isInteractive, hitsToAssign, onConfirm }) => (
    <div data-testid={`fleet-${isInteractive ? 'interactive' : 'passive'}`}>
      {units.map(u => <span key={u.id}>{u.unit_type}</span>)}
      {isInteractive && (
        <button onClick={() => onConfirm([{ unit_type: 'infantry', player_unit_id: 'u1', action: 'destroy' }])}>
          Confirm
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../../src/components/game/DiceResultsPanel.jsx', () => ({
  default: ({ dice, label }) => dice ? <div data-testid="dice-results">{label}</div> : null,
}))

const ATTACKER_ID = 'p1'
const DEFENDER_ID = 'p2'

const PLAYERS = [
  { id: ATTACKER_ID, display_name: 'Alice', colour: '#22c55e' },
  { id: DEFENDER_ID, display_name: 'Bob', colour: '#ef4444' },
]

const BASE_COMBAT = {
  id: 'c1',
  system_key: '1,-1',
  combat_type: 'ground',
  planet_name: 'Wellon',
  round: 1,
  status: 'active',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'attacker_roll',
  attacker_dice: null,
  defender_dice: null,
  attacker_hits: 0,
  defender_hits: 0,
  winner_player_id: null,
}

const ATK_UNITS = [{ id: 'u1', player_id: ATTACKER_ID, unit_type: 'infantry', count: 2, system_key: '1,-1', on_planet: 'Wellon' }]
const DEF_UNITS = [{ id: 'u2', player_id: DEFENDER_ID, unit_type: 'mech', count: 1, system_key: '1,-1', on_planet: 'Wellon' }]

const BASE_PROPS = {
  combat: BASE_COMBAT,
  myPlayerId: ATTACKER_ID,
  players: PLAYERS,
  systemUnits: [...ATK_UNITS, ...DEF_UNITS],
  onRollGroundDice: vi.fn(),
  onAssignHits: vi.fn(),
  onFireScd: vi.fn(),
  onClose: vi.fn(),
}

describe('GroundCombatModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders null when combat is null', () => {
    const { container } = render(<GroundCombatModal {...BASE_PROPS} combat={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders planet name in header', () => {
    render(<GroundCombatModal {...BASE_PROPS} />)
    expect(screen.getByText(/GROUND COMBAT — Wellon/i)).toBeInTheDocument()
  })

  it('renders round number', () => {
    render(<GroundCombatModal {...BASE_PROPS} />)
    expect(screen.getByText(/ROUND 1/i)).toBeInTheDocument()
  })

  it('shows Roll Dice button for attacker on attacker_roll', () => {
    render(<GroundCombatModal {...BASE_PROPS} myPlayerId={ATTACKER_ID} />)
    expect(screen.getByRole('button', { name: /roll dice/i })).toBeInTheDocument()
  })

  it('shows waiting message when not attacker on attacker_roll', () => {
    render(<GroundCombatModal {...BASE_PROPS} myPlayerId={DEFENDER_ID} />)
    expect(screen.queryByRole('button', { name: /roll dice/i })).not.toBeInTheDocument()
    expect(screen.getByText(/waiting for opponent to roll/i)).toBeInTheDocument()
  })

  it('shows Roll Dice for defender on defender_roll', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'defender_roll' }}
      myPlayerId={DEFENDER_ID}
    />)
    expect(screen.getByRole('button', { name: /roll dice/i })).toBeInTheDocument()
  })

  it('does NOT show Roll Dice for attacker on defender_roll', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'defender_roll' }}
      myPlayerId={ATTACKER_ID}
    />)
    expect(screen.queryByRole('button', { name: /roll dice/i })).not.toBeInTheDocument()
  })

  it('Roll Dice calls onRollGroundDice', () => {
    render(<GroundCombatModal {...BASE_PROPS} myPlayerId={ATTACKER_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /roll dice/i }))
    expect(BASE_PROPS.onRollGroundDice).toHaveBeenCalled()
  })

  it('attacker has interactive FleetDisplay on attacker_assign', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'attacker_assign', defender_hits: 2 }}
      myPlayerId={ATTACKER_ID}
    />)
    expect(screen.getAllByTestId('fleet-interactive')).toHaveLength(1)
  })

  it('defender has interactive FleetDisplay on defender_assign', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'defender_assign', attacker_hits: 1 }}
      myPlayerId={DEFENDER_ID}
    />)
    expect(screen.getAllByTestId('fleet-interactive')).toHaveLength(1)
  })

  it('shows waiting message when not caller turn to assign', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'attacker_assign' }}
      myPlayerId={DEFENDER_ID}
    />)
    expect(screen.getByText(/waiting for opponent to assign hits/i)).toBeInTheDocument()
  })

  it('Assign hits calls onAssignHits', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'attacker_assign', defender_hits: 1 }}
      myPlayerId={ATTACKER_ID}
    />)
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(BASE_PROPS.onAssignHits).toHaveBeenCalled()
  })

  it('does NOT render a retreat picker', () => {
    render(<GroundCombatModal {...BASE_PROPS} />)
    expect(screen.queryByText(/declare retreat/i)).not.toBeInTheDocument()
    expect(screen.queryByTestId('retreat-picker')).not.toBeInTheDocument()
  })

  it('shows result screen with winner name when status=complete', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, status: 'complete', winner_player_id: ATTACKER_ID }}
    />)
    expect(screen.getByText(/ground combat complete/i)).toBeInTheDocument()
    expect(screen.getByText(/alice wins/i)).toBeInTheDocument()
  })

  it('Close button calls onClose on result screen', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, status: 'complete', winner_player_id: ATTACKER_ID }}
    />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(BASE_PROPS.onClose).toHaveBeenCalled()
  })

  it('scd_fire shows Fire Space Cannon button for defender', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'scd_fire' }}
      myPlayerId={DEFENDER_ID}
    />)
    expect(screen.getByRole('button', { name: /fire space cannon/i })).toBeInTheDocument()
  })

  it('scd_fire shows waiting message for non-defender', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'scd_fire' }}
      myPlayerId={ATTACKER_ID}
    />)
    expect(screen.queryByRole('button', { name: /fire space cannon/i })).not.toBeInTheDocument()
    expect(screen.getByText(/waiting for defender to fire/i)).toBeInTheDocument()
  })

  it('scd_fire Fire Space Cannon calls onFireScd', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'scd_fire' }}
      myPlayerId={DEFENDER_ID}
    />)
    fireEvent.click(screen.getByRole('button', { name: /fire space cannon/i }))
    expect(BASE_PROPS.onFireScd).toHaveBeenCalled()
  })

  it('scd_assign attacker sees interactive FleetDisplay', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'scd_assign', scd_dice: [{ unit_type: 'pds', roll: 8, hit: true }], scd_hits: 1 }}
      myPlayerId={ATTACKER_ID}
    />)
    expect(screen.getByTestId('fleet-interactive')).toBeInTheDocument()
    expect(screen.getByTestId('dice-results')).toBeInTheDocument()
  })

  it('scd_assign shows waiting for non-attacker', () => {
    render(<GroundCombatModal {...BASE_PROPS}
      combat={{ ...BASE_COMBAT, phase: 'scd_assign', scd_dice: [], scd_hits: 0 }}
      myPlayerId={DEFENDER_ID}
    />)
    expect(screen.getByText(/waiting for attacker to assign losses/i)).toBeInTheDocument()
  })
})
