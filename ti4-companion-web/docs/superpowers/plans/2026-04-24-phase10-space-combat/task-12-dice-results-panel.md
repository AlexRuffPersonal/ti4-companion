# Task 12: DiceResultsPanel Component

**Files:**
- Create: `src/components/game/DiceResultsPanel.jsx`
- Create: `tests/components/game/DiceResultsPanel.test.jsx`

**Context:** Displayed after a roll (attacker or defender). Shows dice results grouped by unit type. Each die result shows the roll value; hits highlighted green, misses grey. Shows total hits count. Visible to both players via Realtime (both see the same dice state from the combat row).

Props:
- `dice` — array of `{ unit_type, roll, hit }` (attacker_dice or defender_dice from combat row)
- `label` — "Attacker" or "Defender"

---

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/DiceResultsPanel.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DiceResultsPanel from '../../../src/components/game/DiceResultsPanel.jsx'

const DICE = [
  { unit_type: 'cruiser', roll: 8, hit: true },
  { unit_type: 'cruiser', roll: 3, hit: false },
  { unit_type: 'destroyer', roll: 9, hit: true },
]

describe('DiceResultsPanel', () => {
  it('renders label', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText(/attacker/i)).toBeInTheDocument()
  })

  it('renders each die roll value', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('9')).toBeInTheDocument()
  })

  it('shows hit count', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText(/2 hit/i)).toBeInTheDocument()
  })

  it('renders nothing when dice is null', () => {
    const { container } = render(<DiceResultsPanel dice={null} label="Attacker" />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when dice is empty', () => {
    const { container } = render(<DiceResultsPanel dice={[]} label="Attacker" />)
    expect(container.firstChild).toBeNull()
  })

  it('groups dice by unit type', () => {
    render(<DiceResultsPanel dice={DICE} label="Attacker" />)
    expect(screen.getByText(/cruiser/i)).toBeInTheDocument()
    expect(screen.getByText(/destroyer/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/DiceResultsPanel.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/game/DiceResultsPanel.jsx`**

```jsx
export default function DiceResultsPanel({ dice, label }) {
  if (!dice || dice.length === 0) return null

  const hits = dice.filter(d => d.hit).length

  const grouped = dice.reduce((acc, d) => {
    if (!acc[d.unit_type]) acc[d.unit_type] = []
    acc[d.unit_type].push(d)
    return acc
  }, {})

  return (
    <div className="panel-inset p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label text-xs">{label} Dice</span>
        <span className="font-display text-xs text-bright">{hits} hit{hits !== 1 ? 's' : ''}</span>
      </div>
      {Object.entries(grouped).map(([unitType, results]) => (
        <div key={unitType} className="flex flex-col gap-1">
          <span className="text-muted text-xs capitalize">{unitType}</span>
          <div className="flex flex-wrap gap-1">
            {results.map((d, i) => (
              <span
                key={i}
                className={`w-7 h-7 flex items-center justify-center rounded font-mono text-xs font-bold border ${
                  d.hit ? 'border-success text-success bg-success/10' : 'border-border text-dim bg-void'
                }`}
              >
                {d.roll}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/DiceResultsPanel.test.jsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/DiceResultsPanel.jsx tests/components/game/DiceResultsPanel.test.jsx
git commit -m "feat: add DiceResultsPanel component for combat dice display"
```
