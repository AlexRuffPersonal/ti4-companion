# Task 13: RetreatDestinationPicker Component

**Files:**
- Create: `src/components/game/RetreatDestinationPicker.jsx`
- Create: `tests/components/game/RetreatDestinationPicker.test.jsx`

**Context:** Shown inline in `CombatModal` when the user taps "Declare Retreat". Lists valid adjacent systems where the retreating player has units or controlled planets. The parent has already validated that retreat is possible; this component just presents the options and calls back when one is selected.

Props:
- `combatSystemKey` — the current combat system (e.g., `"1,-1"`)
- `mapTiles` — `Record<systemKey, { tile_id }>` from `useGalaxy`
- `tileData` — `Record<tile_id, { planets, type }>` from `useGalaxy`
- `systemUnits` — all `game_player_units` rows
- `allPlanets` — all `game_player_planets` rows
- `retreatingPlayerId` — the player who declared retreat
- `onSelect(systemKey)` — called when user picks a destination
- `onCancel()` — called when user cancels

---

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/RetreatDestinationPicker.test.jsx`:

```jsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/RetreatDestinationPicker.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/game/RetreatDestinationPicker.jsx`**

```jsx
function axialNeighborKeys(systemKey) {
  const [q, r] = systemKey.split(',').map(Number)
  return [
    [q + 1, r], [q - 1, r],
    [q, r + 1], [q, r - 1],
    [q + 1, r - 1], [q - 1, r + 1],
  ].map(([nq, nr]) => `${nq},${nr}`)
}

export default function RetreatDestinationPicker({
  combatSystemKey, mapTiles, systemUnits, allPlanets,
  retreatingPlayerId, onSelect, onCancel,
}) {
  const neighbors = new Set(axialNeighborKeys(combatSystemKey))

  const validDestinations = Object.keys(mapTiles).filter(sk => {
    if (!neighbors.has(sk)) return false
    const hasUnits = systemUnits.some(u => u.system_key === sk && u.player_id === retreatingPlayerId && u.on_planet == null)
    const hasPlanets = allPlanets.some(p => p.system_key === sk && p.player_id === retreatingPlayerId)
    return hasUnits || hasPlanets
  })

  return (
    <div className="panel-inset p-3 flex flex-col gap-2">
      <p className="label text-xs">SELECT RETREAT DESTINATION</p>
      {validDestinations.length === 0 ? (
        <p className="text-muted text-xs">No valid retreat destinations.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {validDestinations.map(sk => (
            <button
              key={sk}
              className="btn-ghost text-left text-xs px-2 py-1"
              onClick={() => onSelect(sk)}
            >
              {sk}
            </button>
          ))}
        </div>
      )}
      <button className="btn-ghost text-xs text-muted" onClick={onCancel}>Cancel</button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/RetreatDestinationPicker.test.jsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/RetreatDestinationPicker.jsx tests/components/game/RetreatDestinationPicker.test.jsx
git commit -m "feat: add RetreatDestinationPicker component"
```
