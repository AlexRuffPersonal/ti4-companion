# Task 14: SpaceCannonModal Component

**Files:**
- Create: `src/components/game/SpaceCannonModal.jsx`
- Create: `tests/components/game/SpaceCannonModal.test.jsx`

**Context:** Shown when `combat.phase === 'space_cannon'`. Each player sees their own unresolved entry from `space_cannon_pending`. Players with an entry get Fire / Pass buttons. Players with no entry (or whose entry is already resolved) see a waiting state. The modal closes automatically when the phase advances (handled by the parent via `activeCombat.phase` changing).

Props:
- `combat` — the full `game_combats` row
- `myPlayerId` — the current user's `game_players.id`
- `onFire()` — calls `fireSpaceCannon(false)`
- `onPass()` — calls `fireSpaceCannon(true)`

---

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/SpaceCannonModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SpaceCannonModal from '../../../src/components/game/SpaceCannonModal.jsx'

const MY_ID = 'p1'
const OTHER_ID = 'p2'

const BASE_COMBAT = {
  id: 'c1',
  phase: 'space_cannon',
  space_cannon_pending: [
    { player_id: MY_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 3, resolved: false },
  ],
}

const BASE_PROPS = {
  combat: BASE_COMBAT,
  myPlayerId: MY_ID,
  onFire: vi.fn(),
  onPass: vi.fn(),
}

describe('SpaceCannonModal', () => {
  it('shows Fire and Pass buttons when player has unresolved entry', () => {
    render(<SpaceCannonModal {...BASE_PROPS} />)
    expect(screen.getByRole('button', { name: /fire/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pass/i })).toBeInTheDocument()
  })

  it('shows unit info and dice count', () => {
    render(<SpaceCannonModal {...BASE_PROPS} />)
    expect(screen.getByText(/pds/i)).toBeInTheDocument()
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('calls onFire when Fire is clicked', () => {
    const onFire = vi.fn()
    render(<SpaceCannonModal {...BASE_PROPS} onFire={onFire} />)
    fireEvent.click(screen.getByRole('button', { name: /fire/i }))
    expect(onFire).toHaveBeenCalled()
  })

  it('calls onPass when Pass is clicked', () => {
    const onPass = vi.fn()
    render(<SpaceCannonModal {...BASE_PROPS} onPass={onPass} />)
    fireEvent.click(screen.getByRole('button', { name: /pass/i }))
    expect(onPass).toHaveBeenCalled()
  })

  it('shows waiting state when player has no unresolved entry', () => {
    render(<SpaceCannonModal {...BASE_PROPS} myPlayerId={OTHER_ID} />)
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fire/i })).not.toBeInTheDocument()
  })

  it('shows waiting state when player entry is already resolved', () => {
    const resolvedCombat = {
      ...BASE_COMBAT,
      space_cannon_pending: [
        { player_id: MY_ID, system_key: '1,-1', unit_type: 'pds', dice_count: 3, resolved: true },
      ],
    }
    render(<SpaceCannonModal {...BASE_PROPS} combat={resolvedCombat} />)
    expect(screen.getByText(/waiting/i)).toBeInTheDocument()
  })

  it('renders heading', () => {
    render(<SpaceCannonModal {...BASE_PROPS} />)
    expect(screen.getByText(/space cannon/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/SpaceCannonModal.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/game/SpaceCannonModal.jsx`**

```jsx
export default function SpaceCannonModal({ combat, myPlayerId, onFire, onPass }) {
  const pending = combat?.space_cannon_pending ?? []
  const myEntry = pending.find(e => e.player_id === myPlayerId && !e.resolved)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-sm flex flex-col gap-4">
        <p className="label text-center">SPACE CANNON</p>
        {myEntry ? (
          <>
            <div className="panel-inset p-3 text-center flex flex-col gap-1">
              <p className="text-bright font-display text-sm capitalize">{myEntry.unit_type}</p>
              <p className="text-muted text-xs">from system {myEntry.system_key}</p>
              <p className="text-dim text-xs">{myEntry.dice_count} dice</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={onFire}>Fire</button>
              <button className="btn-ghost flex-1" onClick={onPass}>Pass</button>
            </div>
          </>
        ) : (
          <div className="panel-inset p-4 text-center">
            <p className="text-muted text-sm">Waiting for other players…</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/SpaceCannonModal.test.jsx
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/SpaceCannonModal.jsx tests/components/game/SpaceCannonModal.test.jsx
git commit -m "feat: add SpaceCannonModal component"
```
