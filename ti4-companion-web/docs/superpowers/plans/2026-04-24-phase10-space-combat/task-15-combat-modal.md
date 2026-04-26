# Task 15: CombatModal Component

**Files:**
- Create: `src/components/game/CombatModal.jsx`
- Create: `tests/components/game/CombatModal.test.jsx`

**Context:** Top-level modal shown for all combat phases except `space_cannon`. Layout:
- Header: round number, system key
- Body: attacker fleet (left) + defender fleet (right) via `FleetDisplay`
- Action panel: phase-driven sub-panel (roll button, dice results, hit assignment, retreat)
- When `combat.status === 'complete'`: shows a result screen (winner name, rounds fought) with a Close button

The unit definitions needed for `FleetDisplay` interactivity are fetched once from Supabase on mount. Retreat picker appears inline when the user taps "Declare Retreat".

Props:
- `combat` — the full `game_combats` row (from `useCombat`)
- `myPlayerId` — current player's `game_players.id`
- `players` — array of player objects with `{ id, display_name, colour }`
- `systemUnits` — all `game_player_units` for the game (from `useGalaxy`)
- `mapTiles`, `tileData`, `allPlanets` — from `useGalaxy` (for retreat picker)
- `onRollDice()` — calls `useCombat.rollDice()`
- `onAssignHits(casualties)` — calls `useCombat.assignHits(casualties)`
- `onDeclareRetreat(destination)` — calls `useCombat.declareRetreat(destination)`

---

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/CombatModal.test.jsx`:

```jsx
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
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/CombatModal.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/game/CombatModal.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import FleetDisplay from './FleetDisplay.jsx'
import DiceResultsPanel from './DiceResultsPanel.jsx'
import RetreatDestinationPicker from './RetreatDestinationPicker.jsx'

const ROLL_PHASES = ['barrage', 'attacker_roll', 'defender_roll']
const ASSIGN_PHASES = ['defender_assign', 'attacker_assign']

export default function CombatModal({
  combat, myPlayerId, players, systemUnits,
  mapTiles, tileData, allPlanets,
  onRollDice, onAssignHits, onDeclareRetreat,
}) {
  const [unitDefs, setUnitDefs] = useState(new Map())
  const [showRetreat, setShowRetreat] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    supabase
      .from('units')
      .select('name, sustain_damage')
      .then(({ data }) => {
        if (data) setUnitDefs(new Map(data.map(u => [u.name, u])))
      })
  }, [])

  if (!combat) return null

  const attackerPlayer = players.find(p => p.id === combat.attacker_player_id)
  const defenderPlayer = players.find(p => p.id === combat.defender_player_id)

  const spaceUnits = systemUnits.filter(u => u.system_key === combat.system_key && u.on_planet == null)
  const attackerUnits = spaceUnits.filter(u => u.player_id === combat.attacker_player_id)
  const defenderUnits = spaceUnits.filter(u => u.player_id === combat.defender_player_id)

  const isAttacker = myPlayerId === combat.attacker_player_id
  const isDefender = myPlayerId === combat.defender_player_id
  const isParticipant = isAttacker || isDefender

  const isMyRoll = (combat.phase === 'attacker_roll' && isAttacker) ||
                   (combat.phase === 'defender_roll' && isDefender) ||
                   (combat.phase === 'barrage' && isParticipant)

  const isDefenderAssign = combat.phase === 'defender_assign' && isDefender
  const isAttackerAssign = combat.phase === 'attacker_assign' && isAttacker

  async function handleRoll() {
    setRolling(true)
    try { await onRollDice() } finally { setRolling(false) }
  }

  async function handleAssign(casualties) {
    setAssigning(true)
    try { await onAssignHits(casualties) } finally { setAssigning(false) }
  }

  async function handleSelectRetreat(dest) {
    setShowRetreat(false)
    await onDeclareRetreat(dest)
  }

  // Result screen
  if (combat.status === 'complete') {
    const winner = players.find(p => p.id === combat.winner_player_id)
    return (
      <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
        <div className="panel w-full max-w-md flex flex-col gap-4 text-center">
          <p className="label">COMBAT COMPLETE</p>
          <p className="font-display text-bright text-lg">{winner?.display_name ?? 'Unknown'} wins</p>
          <p className="text-muted text-sm">System {combat.system_key} — Round {combat.round}</p>
          <button className="btn-primary" onClick={() => {}}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="label">SPACE COMBAT — {combat.system_key}</p>
          <p className="text-muted text-xs font-display">ROUND {combat.round}</p>
        </div>

        {/* Fleets */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">{attackerPlayer?.display_name} (Attacker)</p>
            <FleetDisplay
              units={attackerUnits}
              unitDefs={unitDefs}
              isInteractive={isAttackerAssign}
              hitsToAssign={isAttackerAssign ? (combat.defender_hits ?? 0) : 0}
              onConfirm={handleAssign}
            />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted">{defenderPlayer?.display_name} (Defender)</p>
            <FleetDisplay
              units={defenderUnits}
              unitDefs={unitDefs}
              isInteractive={isDefenderAssign}
              hitsToAssign={isDefenderAssign ? (combat.attacker_hits ?? 0) : 0}
              onConfirm={handleAssign}
            />
          </div>
        </div>

        {/* Dice results */}
        {combat.attacker_dice && (
          <DiceResultsPanel dice={combat.attacker_dice} label="Attacker" />
        )}
        {combat.defender_dice && (
          <DiceResultsPanel dice={combat.defender_dice} label="Defender" />
        )}

        {/* Action panel */}
        {ROLL_PHASES.includes(combat.phase) && (
          <div className="flex flex-col gap-2">
            {isMyRoll && (
              <button className="btn-primary" disabled={rolling} onClick={handleRoll}>
                {rolling ? 'Rolling…' : 'Roll Dice'}
              </button>
            )}
            {isParticipant && !showRetreat && (
              <button className="btn-ghost text-xs" onClick={() => setShowRetreat(true)}>
                Declare Retreat
              </button>
            )}
            {showRetreat && (
              <RetreatDestinationPicker
                combatSystemKey={combat.system_key}
                mapTiles={mapTiles}
                tileData={tileData}
                systemUnits={systemUnits}
                allPlanets={allPlanets}
                retreatingPlayerId={myPlayerId}
                onSelect={handleSelectRetreat}
                onCancel={() => setShowRetreat(false)}
              />
            )}
            {combat.retreat_declared_by && (
              <p className="text-warning text-xs text-center">
                Retreat declared — will execute at end of round
              </p>
            )}
          </div>
        )}

        {ASSIGN_PHASES.includes(combat.phase) && !isDefenderAssign && !isAttackerAssign && (
          <p className="text-muted text-xs text-center">Waiting for opponent to assign hits…</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/CombatModal.test.jsx
```

Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/CombatModal.jsx tests/components/game/CombatModal.test.jsx
git commit -m "feat: add CombatModal component with phase-driven action panel"
```
