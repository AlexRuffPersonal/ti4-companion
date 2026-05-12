import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SpaceCombatModal from '../../../src/components/game/SpaceCombatModal.jsx'

vi.mock('../../../src/components/game/DiceResultsPanel.jsx', () => ({
  default: ({ dice, label }) => dice ? <div data-testid="dice-results">{label}</div> : null,
}))

vi.mock('../../../src/components/game/FleetDisplay.jsx', () => ({
  default: ({ units, isInteractive, hitsToAssign, onConfirm }) => (
    <div data-testid={`fleet-${isInteractive ? 'interactive' : 'passive'}`}>
      {units.map(u => <span key={u.id}>{u.unit_type}</span>)}
      {isInteractive && (
        <button onClick={() => onConfirm([{ unit_type: 'fighter', player_unit_id: 'u1', action: 'destroy' }])}>
          Confirm Hits
        </button>
      )}
    </div>
  ),
}))

vi.mock('../../../src/components/game/ActionCardWindowPanel.jsx', () => ({
  default: ({ combat }) => <div data-testid="action-card-window">{combat.phase}</div>,
}))

const ATTACKER_ID = 'p1'
const DEFENDER_ID = 'p2'

const ATK_FIGHTER = { id: 'u1', player_id: ATTACKER_ID, unit_type: 'fighter', count: 2, damaged: false, system_key: '1,-1', on_planet: null }
const DEF_FIGHTER = { id: 'u2', player_id: DEFENDER_ID, unit_type: 'fighter', count: 1, damaged: false, system_key: '1,-1', on_planet: null }

const BASE_COMBAT = {
  id: 'c1',
  system_key: '1,-1',
  attacker_player_id: ATTACKER_ID,
  defender_player_id: DEFENDER_ID,
  phase: 'barrage',
  barrage_attacker_dice: null,
  barrage_defender_dice: null,
  barrage_attacker_hits: 0,
  barrage_defender_hits: 0,
  window_passes: {},
}

const BASE_PROPS = {
  combat: BASE_COMBAT,
  myPlayerId: ATTACKER_ID,
  systemUnits: {
    [ATTACKER_ID]: [ATK_FIGHTER],
    [DEFENDER_ID]: [DEF_FIGHTER],
  },
  unitDefs: new Map(),
  hasAfbUnits: true,
  windowCards: [],
  isWindowPhase: false,
  onFireBarrage: vi.fn(),
  onAdvanceBarrage: vi.fn(),
  onAssignHits: vi.fn(),
  playActionCard: vi.fn(),
  passActionWindow: vi.fn(),
}

describe('SpaceCombatModal — barrage phase, hasAfbUnits=true, dice=null', () => {
  it('renders Fire Anti-Fighter Barrage button when isAttacker', () => {
    render(<SpaceCombatModal {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /fire anti-fighter barrage/i })).toBeInTheDocument()
  })

  it('calls onFireBarrage when fire button is clicked', async () => {
    const onFireBarrage = vi.fn().mockResolvedValue(undefined)
    render(<SpaceCombatModal {...BASE_PROPS} onFireBarrage={onFireBarrage} />)
    fireEvent.click(screen.getByRole('button', { name: /fire anti-fighter barrage/i }))
    expect(onFireBarrage).toHaveBeenCalled()
  })

  it('does not show fire button when isDefender, shows waiting message', () => {
    render(<SpaceCombatModal {...BASE_PROPS} myPlayerId={DEFENDER_ID} />)
    expect(screen.queryByRole('button', { name: /fire anti-fighter barrage/i })).not.toBeInTheDocument()
    expect(screen.getByText(/waiting for attacker to fire barrage/i)).toBeInTheDocument()
  })
})

describe('SpaceCombatModal — barrage phase, hasAfbUnits=false', () => {
  const noAfbProps = { ...BASE_PROPS, hasAfbUnits: false }

  it('renders no capable units message and Continue button for attacker', () => {
    render(<SpaceCombatModal {...noAfbProps} />)
    expect(screen.getByText(/no units capable of anti-fighter barrage/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue to combat/i })).toBeInTheDocument()
  })

  it('calls onAdvanceBarrage when Continue is clicked', () => {
    const onAdvanceBarrage = vi.fn()
    render(<SpaceCombatModal {...noAfbProps} onAdvanceBarrage={onAdvanceBarrage} />)
    fireEvent.click(screen.getByRole('button', { name: /continue to combat/i }))
    expect(onAdvanceBarrage).toHaveBeenCalled()
  })
})

describe('SpaceCombatModal — barrage phase, dice present', () => {
  const diceProps = {
    ...BASE_PROPS,
    combat: {
      ...BASE_COMBAT,
      barrage_attacker_dice: [{ roll: 7, hit: true, unit_type: 'destroyer' }],
      barrage_defender_dice: [{ roll: 4, hit: false, unit_type: 'fighter' }],
      barrage_attacker_hits: 1,
      barrage_defender_hits: 0,
    },
  }

  it('renders two DiceResultsPanel components', () => {
    render(<SpaceCombatModal {...diceProps} />)
    expect(screen.getAllByTestId('dice-results')).toHaveLength(2)
  })

  it('renders Continue to Combat button for attacker', () => {
    render(<SpaceCombatModal {...diceProps} />)
    expect(screen.getByRole('button', { name: /continue to combat/i })).toBeInTheDocument()
  })
})

describe('SpaceCombatModal — afb_attacker_assign phase', () => {
  const assignProps = {
    ...BASE_PROPS,
    combat: {
      ...BASE_COMBAT,
      phase: 'afb_attacker_assign',
      barrage_attacker_dice: [{ roll: 7, hit: true, unit_type: 'destroyer' }],
      barrage_defender_dice: [{ roll: 4, hit: false, unit_type: 'fighter' }],
      barrage_attacker_hits: 1,
      barrage_defender_hits: 1,
    },
  }

  it('renders interactive FleetDisplay for attacker with correct hitsToAssign', () => {
    render(<SpaceCombatModal {...assignProps} />)
    expect(screen.getByTestId('fleet-interactive')).toBeInTheDocument()
  })

  it('calls onAssignHits when FleetDisplay confirms', () => {
    const onAssignHits = vi.fn()
    render(<SpaceCombatModal {...assignProps} onAssignHits={onAssignHits} />)
    fireEvent.click(screen.getByText('Confirm Hits'))
    expect(onAssignHits).toHaveBeenCalled()
  })

  it('shows waiting message for defender', () => {
    render(<SpaceCombatModal {...assignProps} myPlayerId={DEFENDER_ID} />)
    expect(screen.getByText(/waiting for attacker to assign losses/i)).toBeInTheDocument()
    expect(screen.queryByTestId('fleet-interactive')).not.toBeInTheDocument()
  })
})

describe('SpaceCombatModal — afb_defender_assign phase', () => {
  const assignProps = {
    ...BASE_PROPS,
    combat: {
      ...BASE_COMBAT,
      phase: 'afb_defender_assign',
      barrage_attacker_dice: [{ roll: 7, hit: true, unit_type: 'destroyer' }],
      barrage_defender_dice: [{ roll: 4, hit: false, unit_type: 'fighter' }],
      barrage_attacker_hits: 1,
      barrage_defender_hits: 0,
    },
  }

  it('renders interactive FleetDisplay for defender', () => {
    render(<SpaceCombatModal {...assignProps} myPlayerId={DEFENDER_ID} />)
    expect(screen.getByTestId('fleet-interactive')).toBeInTheDocument()
  })

  it('shows waiting message for non-defender', () => {
    render(<SpaceCombatModal {...assignProps} myPlayerId={ATTACKER_ID} />)
    expect(screen.getByText(/waiting for defender to assign losses/i)).toBeInTheDocument()
  })
})

describe('SpaceCombatModal — Phase 20 action window', () => {
  it('renders ActionCardWindowPanel when isWindowPhase=true during afb_attacker_assign', () => {
    const props = {
      ...BASE_PROPS,
      isWindowPhase: true,
      windowCards: [{ id: 'ac1', name: 'Morale Boost' }],
      combat: {
        ...BASE_COMBAT,
        phase: 'afb_attacker_assign',
        barrage_attacker_dice: [{ roll: 7, hit: true, unit_type: 'destroyer' }],
        barrage_defender_dice: [],
        barrage_attacker_hits: 1,
        barrage_defender_hits: 1,
      },
    }
    render(<SpaceCombatModal {...props} />)
    expect(screen.getByTestId('action-card-window')).toBeInTheDocument()
  })
})
