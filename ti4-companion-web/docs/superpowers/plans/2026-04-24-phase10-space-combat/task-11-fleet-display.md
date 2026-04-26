# Task 11: FleetDisplay Component

**Files:**
- Create: `src/components/game/FleetDisplay.jsx`
- Create: `tests/components/game/FleetDisplay.test.jsx`

**Context:** Renders one player's space fleet as unit chips. Damaged units display with an amber border and ⚡ icon. In hit-assignment phases (`defender_assign` or `attacker_assign`), the **receiving** player's chips are interactive: tapping a chip cycles `neutral → sustain (amber, eligible undamaged sustain-damage units only) → destroy (red ✕) → neutral`. A Confirm button is enabled only when the total assigned hits match `hitsToAssign`.

Props:
- `units` — array of `{ id, unit_type, count, damaged }` (space units for this player)
- `unitDefs` — map of `unit_type → { sustain_damage: boolean }` for sustain eligibility
- `isInteractive` — boolean; true when this player must assign hits
- `hitsToAssign` — number of hits to assign (0 when not interactive)
- `onConfirm(casualties)` — called with `[{ unit_type, player_unit_id, action }]` when confirmed

---

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/FleetDisplay.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FleetDisplay from '../../../src/components/game/FleetDisplay.jsx'

const UNITS = [
  { id: 'u1', unit_type: 'carrier', count: 2, damaged: false },
  { id: 'u2', unit_type: 'dreadnought', count: 1, damaged: false },
  { id: 'u3', unit_type: 'fighter', count: 3, damaged: false },
]

const UNIT_DEFS = new Map([
  ['carrier', { sustain_damage: false }],
  ['dreadnought', { sustain_damage: true }],
  ['fighter', { sustain_damage: false }],
])

const BASE_PROPS = {
  units: UNITS,
  unitDefs: UNIT_DEFS,
  isInteractive: false,
  hitsToAssign: 0,
  onConfirm: vi.fn(),
}

describe('FleetDisplay', () => {
  it('renders a chip for each unit type with count', () => {
    render(<FleetDisplay {...BASE_PROPS} />)
    expect(screen.getByText(/carrier/i)).toBeInTheDocument()
    expect(screen.getByText(/dreadnought/i)).toBeInTheDocument()
    expect(screen.getByText(/fighter/i)).toBeInTheDocument()
  })

  it('shows ⚡ icon on damaged units', () => {
    const damagedUnits = [{ id: 'u2', unit_type: 'dreadnought', count: 1, damaged: true }]
    render(<FleetDisplay {...BASE_PROPS} units={damagedUnits} />)
    expect(screen.getByText('⚡')).toBeInTheDocument()
  })

  it('does not show Confirm button when not interactive', () => {
    render(<FleetDisplay {...BASE_PROPS} />)
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('shows Confirm button when interactive', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument()
  })

  it('Confirm button is disabled until all hits assigned', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  })

  it('clicking a chip once marks it for destroy', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    const chip = screen.getByTestId('chip-u1')
    fireEvent.click(chip)
    expect(chip).toHaveClass('border-danger')
  })

  it('clicking a sustain-capable chip marks it for sustain on first click', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    const chip = screen.getByTestId('chip-u2')
    fireEvent.click(chip)
    expect(chip).toHaveClass('border-warning')
  })

  it('Confirm button enables when correct number of hits assigned', () => {
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} />)
    fireEvent.click(screen.getByTestId('chip-u1'))
    expect(screen.getByRole('button', { name: /confirm/i })).not.toBeDisabled()
  })

  it('calls onConfirm with casualties when Confirm clicked', () => {
    const onConfirm = vi.fn()
    render(<FleetDisplay {...BASE_PROPS} isInteractive hitsToAssign={1} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByTestId('chip-u1'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ player_unit_id: 'u1', action: 'destroy' }),
    ])
  })

  it('does not allow sustain on already-damaged unit', () => {
    const damagedDread = [{ id: 'u2', unit_type: 'dreadnought', count: 1, damaged: true }]
    render(<FleetDisplay {...BASE_PROPS} units={damagedDread} isInteractive hitsToAssign={1} />)
    const chip = screen.getByTestId('chip-u2')
    fireEvent.click(chip)
    // Should go straight to destroy (red), not sustain (amber)
    expect(chip).toHaveClass('border-danger')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/FleetDisplay.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/game/FleetDisplay.jsx`**

```jsx
import { useState } from 'react'

const NEUTRAL = 'neutral'
const SUSTAIN = 'sustain'
const DESTROY = 'destroy'

function nextState(current, canSustain) {
  if (current === NEUTRAL) return canSustain ? SUSTAIN : DESTROY
  if (current === SUSTAIN) return DESTROY
  return NEUTRAL
}

export default function FleetDisplay({ units, unitDefs, isInteractive, hitsToAssign, onConfirm }) {
  const [chipStates, setChipStates] = useState({})

  function handleChipClick(unit) {
    if (!isInteractive) return
    const def = unitDefs?.get(unit.unit_type)
    const canSustain = def?.sustain_damage && !unit.damaged
    setChipStates(prev => {
      const current = prev[unit.id] ?? NEUTRAL
      return { ...prev, [unit.id]: nextState(current, canSustain) }
    })
  }

  const assigned = Object.values(chipStates).filter(s => s !== NEUTRAL).length
  const canConfirm = assigned === hitsToAssign && hitsToAssign > 0

  function handleConfirm() {
    const casualties = []
    for (const unit of units) {
      const state = chipStates[unit.id] ?? NEUTRAL
      if (state === DESTROY) casualties.push({ unit_type: unit.unit_type, player_unit_id: unit.id, action: 'destroy' })
      if (state === SUSTAIN) casualties.push({ unit_type: unit.unit_type, player_unit_id: unit.id, action: 'sustain' })
    }
    onConfirm(casualties)
    setChipStates({})
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {units.map(unit => {
          const state = chipStates[unit.id] ?? NEUTRAL
          const borderClass =
            state === DESTROY ? 'border-danger' :
            state === SUSTAIN ? 'border-warning' :
            unit.damaged ? 'border-warning' :
            'border-border'
          return (
            <button
              key={unit.id}
              data-testid={`chip-${unit.id}`}
              onClick={() => handleChipClick(unit)}
              className={`panel-inset px-2 py-1 border-2 rounded text-xs font-body flex items-center gap-1 ${borderClass} ${isInteractive ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="font-display text-text capitalize">{unit.unit_type}</span>
              <span className="text-muted">×{unit.count}</span>
              {unit.damaged && <span>⚡</span>}
              {state === DESTROY && <span className="text-danger">✕</span>}
            </button>
          )
        })}
      </div>
      {isInteractive && (
        <button
          className="btn-primary text-xs mt-1"
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          Confirm ({assigned}/{hitsToAssign})
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/FleetDisplay.test.jsx
```

Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/FleetDisplay.jsx tests/components/game/FleetDisplay.test.jsx
git commit -m "feat: add FleetDisplay component with interactive hit assignment chips"
```
