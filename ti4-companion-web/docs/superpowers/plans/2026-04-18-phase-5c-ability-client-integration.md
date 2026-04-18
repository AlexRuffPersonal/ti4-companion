# Phase 5c — Ability Client Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the ability system into the React UI. `useGameEvents` maps game state transitions to typed events; `useAbilities` filters the ability registry to the currently triggerable set. `AbilityNotificationBar` surfaces reactive abilities; `AbilityTargetModal` collects player selections before calling `game-resolve-ability`. `ActionCardModal` gains a contextual PLAY button. `MyPanelSection` gains a Faction Abilities sub-section and commander unlock prompts.

**Architecture:** Both new hooks are pure computation (no side effects): `useGameEvents` watches `game.phase` with a ref to avoid re-firing on unchanged phase; `useAbilities` uses `useMemo` and filters the loaded ability definitions client-side. `GameScreen` owns the `allAbilityDefinitions` fetch (loaded once on mount alongside technologies) and the `activatingAbility` state slot that drives `AbilityTargetModal`. Phase changes are the primary event source for now; explicit `emitEvent` calls from action wrappers extend coverage over time.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, Vitest 4, @testing-library/react

---

## File Map

| Action | Path |
|---|---|
| Create | `ti4-companion-web/src/hooks/useGameEvents.js` |
| Create | `ti4-companion-web/src/hooks/useAbilities.js` |
| Create | `ti4-companion-web/src/components/game/AbilityNotificationBar.jsx` |
| Create | `ti4-companion-web/src/components/game/AbilityTargetModal.jsx` |
| Modify | `ti4-companion-web/src/components/game/ActionCardModal.jsx` |
| Modify | `ti4-companion-web/src/components/game/MyPanelSection.jsx` |
| Modify | `ti4-companion-web/src/components/game/GameScreen.jsx` |
| Create | `ti4-companion-web/tests/hooks/useGameEvents.test.js` |
| Create | `ti4-companion-web/tests/hooks/useAbilities.test.js` |
| Create | `ti4-companion-web/tests/components/game/AbilityNotificationBar.test.jsx` |
| Create | `ti4-companion-web/tests/components/game/AbilityTargetModal.test.jsx` |

---

## Task 1: `useGameEvents` hook (TDD)

**Files:**
- Create: `ti4-companion-web/src/hooks/useGameEvents.js`
- Create: `ti4-companion-web/tests/hooks/useGameEvents.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/hooks/useGameEvents.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameEvents } from '../../src/hooks/useGameEvents.js'

const BASE_GAME = { id: 'g1', phase: 'action' }

describe('useGameEvents', () => {
  it('emits ACTION_PHASE_START when game.phase is action on mount', () => {
    const { result } = renderHook(() => useGameEvents(BASE_GAME, [], null))
    expect(result.current.currentEvent).toMatchObject({ type: 'ACTION_PHASE_START', gameId: 'g1' })
  })

  it('emits AGENDA_PHASE_START when game.phase changes to agenda', () => {
    const { result, rerender } = renderHook(({ game }) => useGameEvents(game, [], null), {
      initialProps: { game: BASE_GAME },
    })
    rerender({ game: { id: 'g1', phase: 'agenda' } })
    expect(result.current.currentEvent).toMatchObject({ type: 'AGENDA_PHASE_START', gameId: 'g1' })
  })

  it('does not re-emit if phase does not change', () => {
    const { result, rerender } = renderHook(({ game }) => useGameEvents(game, [], null), {
      initialProps: { game: BASE_GAME },
    })
    const first = result.current.currentEvent
    rerender({ game: { id: 'g1', phase: 'action', round: 2 } })
    expect(result.current.currentEvent).toBe(first)
  })

  it('emitEvent sets currentEvent with the given type and gameId', () => {
    const { result } = renderHook(() => useGameEvents(BASE_GAME, [], null))
    act(() => {
      result.current.emitEvent('SPACE_COMBAT_START', { triggeredByPlayerId: 'p1' })
    })
    expect(result.current.currentEvent).toMatchObject({
      type: 'SPACE_COMBAT_START',
      gameId: 'g1',
      triggeredByPlayerId: 'p1',
    })
  })

  it('clearEvent sets currentEvent to null', () => {
    const { result } = renderHook(() => useGameEvents(BASE_GAME, [], null))
    act(() => { result.current.clearEvent() })
    expect(result.current.currentEvent).toBeNull()
  })

  it('returns null event when game is null', () => {
    const { result } = renderHook(() => useGameEvents(null, [], null))
    expect(result.current.currentEvent).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd ti4-companion-web
npx vitest run tests/hooks/useGameEvents.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/useGameEvents.js`**

```javascript
import { useState, useEffect, useRef, useCallback } from 'react'

const PHASE_EVENT_MAP = {
  strategy: 'STRATEGY_PHASE_START',
  action: 'ACTION_PHASE_START',
  status: 'STATUS_PHASE_START',
  agenda: 'AGENDA_PHASE_START',
}

export function useGameEvents(game, players, currentPlayer) {
  const [currentEvent, setCurrentEvent] = useState(null)
  const prevPhaseRef = useRef(null)

  useEffect(() => {
    if (!game?.phase) return
    if (game.phase === prevPhaseRef.current) return

    const eventType = PHASE_EVENT_MAP[game.phase]
    if (eventType) {
      setCurrentEvent({ type: eventType, gameId: game.id, triggeredByPlayerId: null })
    }
    prevPhaseRef.current = game.phase
  }, [game?.phase, game?.id])

  const emitEvent = useCallback((type, data = {}) => {
    setCurrentEvent({ type, gameId: game?.id ?? null, ...data })
  }, [game?.id])

  const clearEvent = useCallback(() => {
    setCurrentEvent(null)
  }, [])

  return { currentEvent, emitEvent, clearEvent }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/hooks/useGameEvents.test.js
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGameEvents.js tests/hooks/useGameEvents.test.js
git commit -m "feat: add useGameEvents hook"
```

---

## Task 2: `useAbilities` hook (TDD)

**Files:**
- Create: `ti4-companion-web/src/hooks/useAbilities.js`
- Create: `ti4-companion-web/tests/hooks/useAbilities.test.js`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/hooks/useAbilities.test.js`:

```javascript
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAbilities } from '../../src/hooks/useAbilities.js'

const PLAYER_SOURCES = {
  playerId: 'p1',
  factionName: 'The Mentak Coalition',
  actionCardIds: ['card-uuid-1'],
  leaderIds: [],
  relicIds: [],
  promissoryNoteIds: [],
  technologyIds: ['tech-1', 'tech-2', 'tech-3'],
  explorationCardIds: [],
  scoredObjectivesCount: 3,
  vp: 5,
}

const FACTION_ABILITY = {
  id: 'ab-1',
  ability_name: 'Pillage',
  trigger: { event: 'TRADE_GOODS_GAINED', owner: 'other' },
  unlock_conditions: null,
  ability_sources: [{ source_type: 'faction_ability', faction_name: 'The Mentak Coalition' }],
}

const ACTION_CARD_ABILITY = {
  id: 'ab-2',
  ability_name: 'Ancient Burial Sites',
  trigger: { event: 'AGENDA_PHASE_START', owner: 'self' },
  unlock_conditions: null,
  ability_sources: [{ source_type: 'action_card', source_id: 'card-uuid-1' }],
}

const COMMANDER_UNLOCK_ABILITY = {
  id: 'ab-3',
  ability_name: 'Il Na Viroset unlock',
  trigger: { event: 'PASSIVE' },
  unlock_conditions: [{ check: 'scored_objectives', gte: 3 }],
  ability_sources: [{ source_type: 'leader', source_id: 'leader-uuid-1' }],
}

const ALL_ABILITIES = [FACTION_ABILITY, ACTION_CARD_ABILITY, COMMANDER_UNLOCK_ABILITY]

describe('useAbilities', () => {
  it('returns empty triggerable when currentEvent is null', () => {
    const { result } = renderHook(() => useAbilities(null, PLAYER_SOURCES, ALL_ABILITIES))
    expect(result.current.triggerable).toHaveLength(0)
  })

  it('returns faction ability when event matches and player has that faction', () => {
    const event = { type: 'TRADE_GOODS_GAINED', gameId: 'g1', triggeredByPlayerId: 'p2' }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, ALL_ABILITIES))
    expect(result.current.triggerable).toContainEqual(expect.objectContaining({ id: 'ab-1' }))
  })

  it('returns action card ability when event matches and player holds the card', () => {
    const event = { type: 'AGENDA_PHASE_START', gameId: 'g1', triggeredByPlayerId: null }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, ALL_ABILITIES))
    expect(result.current.triggerable).toContainEqual(expect.objectContaining({ id: 'ab-2' }))
  })

  it('does not return ability when player does not hold the source card', () => {
    const sources = { ...PLAYER_SOURCES, actionCardIds: [] }
    const event = { type: 'AGENDA_PHASE_START', gameId: 'g1', triggeredByPlayerId: null }
    const { result } = renderHook(() => useAbilities(event, sources, ALL_ABILITIES))
    expect(result.current.triggerable.map(a => a.id)).not.toContain('ab-2')
  })

  it('does not return faction ability when event owner is self but triggeredByPlayerId is another player', () => {
    const selfAbility = { ...FACTION_ABILITY, trigger: { event: 'TRADE_GOODS_GAINED', owner: 'self' } }
    const event = { type: 'TRADE_GOODS_GAINED', gameId: 'g1', triggeredByPlayerId: 'p2' }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, [selfAbility]))
    expect(result.current.triggerable).toHaveLength(0)
  })

  it('returns commander in unlockable when unlock_conditions are met', () => {
    const sources = { ...PLAYER_SOURCES, lockedCommanderAbilityIds: ['ab-3'] }
    const { result } = renderHook(() => useAbilities(null, sources, ALL_ABILITIES))
    expect(result.current.unlockable).toContainEqual(expect.objectContaining({ id: 'ab-3' }))
  })

  it('does not return commander in unlockable when conditions are not met', () => {
    const sources = { ...PLAYER_SOURCES, lockedCommanderAbilityIds: ['ab-3'], scoredObjectivesCount: 2 }
    const { result } = renderHook(() => useAbilities(null, sources, ALL_ABILITIES))
    expect(result.current.unlockable).toHaveLength(0)
  })

  it('returns empty arrays when allAbilityDefinitions is empty', () => {
    const event = { type: 'AGENDA_PHASE_START', gameId: 'g1', triggeredByPlayerId: null }
    const { result } = renderHook(() => useAbilities(event, PLAYER_SOURCES, []))
    expect(result.current.triggerable).toHaveLength(0)
    expect(result.current.unlockable).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/hooks/useAbilities.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/hooks/useAbilities.js`**

```javascript
import { useMemo } from 'react'

export function useAbilities(currentEvent, playerSources, allAbilityDefinitions) {
  const triggerable = useMemo(() => {
    if (!currentEvent || !allAbilityDefinitions?.length || !playerSources) return []

    return allAbilityDefinitions.filter(ability => {
      const trigger = ability.trigger
      if (!trigger || trigger.event !== currentEvent.type) return false

      const owner = trigger.owner ?? 'self'
      if (owner === 'self' && currentEvent.triggeredByPlayerId !== null &&
          currentEvent.triggeredByPlayerId !== playerSources.playerId) return false
      if (owner === 'other' && currentEvent.triggeredByPlayerId === playerSources.playerId) return false

      return (ability.ability_sources ?? []).some(source => {
        switch (source.source_type) {
          case 'action_card':      return playerSources.actionCardIds?.includes(source.source_id)
          case 'faction_ability':  return source.faction_name === playerSources.factionName
          case 'leader':           return playerSources.leaderIds?.includes(source.source_id)
          case 'relic':            return playerSources.relicIds?.includes(source.source_id)
          case 'promissory_note':  return playerSources.promissoryNoteIds?.includes(source.source_id)
          case 'technology':       return playerSources.technologyIds?.includes(source.source_id)
          case 'exploration_card': return playerSources.explorationCardIds?.includes(source.source_id)
          default:                 return false
        }
      })
    })
  }, [currentEvent, playerSources, allAbilityDefinitions])

  const unlockable = useMemo(() => {
    if (!allAbilityDefinitions?.length || !playerSources) return []

    return allAbilityDefinitions.filter(ability => {
      if (!ability.unlock_conditions?.length) return false
      if (!playerSources.lockedCommanderAbilityIds?.includes(ability.id)) return false

      return ability.unlock_conditions.every(condition => {
        switch (condition.check) {
          case 'scored_objectives': return (playerSources.scoredObjectivesCount ?? 0) >= condition.gte
          case 'tech_count':        return (playerSources.technologyIds?.length ?? 0) >= condition.gte
          case 'vp_count':          return (playerSources.vp ?? 0) >= condition.gte
          default:                  return false
        }
      })
    })
  }, [playerSources, allAbilityDefinitions])

  return { triggerable, unlockable }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/hooks/useAbilities.test.js
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAbilities.js tests/hooks/useAbilities.test.js
git commit -m "feat: add useAbilities hook"
```

---

## Task 3: `AbilityNotificationBar` component (TDD)

**Files:**
- Create: `ti4-companion-web/src/components/game/AbilityNotificationBar.jsx`
- Create: `ti4-companion-web/tests/components/game/AbilityNotificationBar.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/components/game/AbilityNotificationBar.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AbilityNotificationBar from '../../../src/components/game/AbilityNotificationBar.jsx'

const ABILITIES = [
  { id: 'ab-1', ability_name: 'Pillage' },
  { id: 'ab-2', ability_name: 'Bribery' },
]

describe('AbilityNotificationBar', () => {
  it('renders nothing when triggerable is empty', () => {
    const { container } = render(<AbilityNotificationBar triggerable={[]} onPlay={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a notification for each triggerable ability', () => {
    render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={vi.fn()} />)
    expect(screen.getByText(/pillage/i)).toBeInTheDocument()
    expect(screen.getByText(/bribery/i)).toBeInTheDocument()
  })

  it('calls onPlay with the ability when PLAY is clicked', () => {
    const onPlay = vi.fn()
    render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={onPlay} />)
    fireEvent.click(screen.getAllByRole('button', { name: /play/i })[0])
    expect(onPlay).toHaveBeenCalledWith(ABILITIES[0])
  })

  it('hides a notification after DISMISS is clicked', () => {
    render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])
    expect(screen.queryByText(/pillage/i)).not.toBeInTheDocument()
    expect(screen.getByText(/bribery/i)).toBeInTheDocument()
  })

  it('shows all notifications again when triggerable prop changes', () => {
    const { rerender } = render(<AbilityNotificationBar triggerable={ABILITIES} onPlay={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[0])
    const newAbilities = [{ id: 'ab-3', ability_name: 'New Ability' }]
    rerender(<AbilityNotificationBar triggerable={newAbilities} onPlay={vi.fn()} />)
    expect(screen.getByText(/new ability/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/game/AbilityNotificationBar.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/game/AbilityNotificationBar.jsx`**

```jsx
import { useState, useEffect } from 'react'

export default function AbilityNotificationBar({ triggerable, onPlay }) {
  const [dismissed, setDismissed] = useState(new Set())

  // Reset dismissed set when triggerable changes (new event window)
  useEffect(() => {
    setDismissed(new Set())
  }, [triggerable])

  const visible = (triggerable ?? []).filter(a => !dismissed.has(a.id))

  if (!visible.length) return null

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {visible.map(ability => (
        <div key={ability.id} className="panel-inset flex items-center justify-between gap-3">
          <span className="text-warning font-display text-xs tracking-widest">
            ⚡ {ability.ability_name.toUpperCase()} PLAYABLE
          </span>
          <div className="flex gap-2">
            <button className="btn-primary text-xs" onClick={() => onPlay(ability)}>
              PLAY
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={() => setDismissed(prev => new Set([...prev, ability.id]))}
            >
              DISMISS
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/AbilityNotificationBar.test.jsx
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/AbilityNotificationBar.jsx tests/components/game/AbilityNotificationBar.test.jsx
git commit -m "feat: add AbilityNotificationBar component"
```

---

## Task 4: `AbilityTargetModal` component (TDD)

**Files:**
- Create: `ti4-companion-web/src/components/game/AbilityTargetModal.jsx`
- Create: `ti4-companion-web/tests/components/game/AbilityTargetModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `ti4-companion-web/tests/components/game/AbilityTargetModal.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AbilityTargetModal from '../../../src/components/game/AbilityTargetModal.jsx'

const PLAYERS = [
  { id: 'p1', display_name: 'Alice' },
  { id: 'p2', display_name: 'Bob' },
]

const PLANETS = [
  { planet_name: 'Jord' },
  { planet_name: 'Nestphar' },
]

function makeAbility(effects) {
  return { id: 'ab-1', ability_name: 'Test Ability', effects }
}

describe('AbilityTargetModal', () => {
  it('renders ability name', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'gain_trade_goods', amount: 1 }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByText(/test ability/i)).toBeInTheDocument()
  })

  it('shows player picker when an effect has chosen_player target', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'exhaust_planets', target: 'chosen_player' }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('shows amount input when an effect uses chosen_amount', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'spend_trade_goods', amount: 'chosen_amount' }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('shows choose_one options when effect is choose_one', () => {
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'choose_one', options: [{ op: 'gain_vp', amount: 1 }, { op: 'gain_trade_goods', amount: 2 }] }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /gain vp/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /gain trade goods/i })).toBeInTheDocument()
  })

  it('calls onConfirm with selections when CONFIRM is clicked', () => {
    const onConfirm = vi.fn()
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'gain_trade_goods', amount: 1 }])}
        sourceId="src-uuid" sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={onConfirm} onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      ability_definition_id: 'ab-1',
      source_type: 'faction_ability',
      source_id: 'src-uuid',
    }))
  })

  it('calls onClose when CANCEL is clicked', () => {
    const onClose = vi.fn()
    render(
      <AbilityTargetModal
        ability={makeAbility([{ op: 'gain_trade_goods', amount: 1 }])}
        sourceId={null} sourceType="faction_ability"
        players={PLAYERS} planets={PLANETS}
        onConfirm={vi.fn()} onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/game/AbilityTargetModal.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/game/AbilityTargetModal.jsx`**

```jsx
import { useState } from 'react'

function hasTarget(effects, target) {
  return (effects ?? []).some(op =>
    op.target === target ||
    (op.op === 'choose_one' && op.options?.some(o => o.target === target))
  )
}

function hasChosenAmount(effects) {
  return (effects ?? []).some(op =>
    op.amount === 'chosen_amount' ||
    (op.op === 'choose_one' && op.options?.some(o => o.amount === 'chosen_amount'))
  )
}

function getChooseOneOp(effects) {
  return (effects ?? []).find(op => op.op === 'choose_one') ?? null
}

export default function AbilityTargetModal({ ability, sourceId, sourceType, players, planets, onConfirm, onClose }) {
  const [chosenPlayer, setChosenPlayer] = useState(null)
  const [chosenPlanet, setChosenPlanet] = useState(null)
  const [chosenAmount, setChosenAmount] = useState(0)
  const [chosenOption, setChosenOption] = useState(null)

  const effects = ability.effects ?? []
  const needsPlayer = hasTarget(effects, 'chosen_player')
  const needsPlanet = hasTarget(effects, 'chosen_planet')
  const needsAmount = hasChosenAmount(effects)
  const chooseOneOp = getChooseOneOp(effects)

  function handleConfirm() {
    onConfirm({
      ability_definition_id: ability.id,
      source_type: sourceType,
      source_id: sourceId,
      selections: {
        chosen_player: chosenPlayer ?? undefined,
        chosen_planet: chosenPlanet ?? undefined,
        chosen_amount: needsAmount ? chosenAmount : undefined,
        chosen_option: chosenOption ?? undefined,
      },
    })
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">{ability.ability_name.toUpperCase()}</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
        </div>

        {chooseOneOp && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose one:</p>
            {chooseOneOp.options.map((opt, i) => (
              <button
                key={i}
                className={chosenOption === i ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenOption(i)}
              >
                {opt.op.replace(/_/g, ' ').toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {needsPlayer && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a player:</p>
            {players.map(p => (
              <button
                key={p.id}
                className={chosenPlayer === p.id ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenPlayer(p.id)}
              >
                {p.display_name}
              </button>
            ))}
          </div>
        )}

        {needsPlanet && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a planet:</p>
            {planets.map(p => (
              <button
                key={p.planet_name}
                className={chosenPlanet === p.planet_name ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenPlanet(p.planet_name)}
              >
                {p.planet_name}
              </button>
            ))}
          </div>
        )}

        {needsAmount && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose amount:</p>
            <input
              type="number"
              min="0"
              value={chosenAmount}
              onChange={e => setChosenAmount(parseInt(e.target.value) || 0)}
              className="input text-xs w-24"
            />
          </div>
        )}

        <button className="btn-primary text-xs" onClick={handleConfirm}>
          CONFIRM
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/game/AbilityTargetModal.test.jsx
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/game/AbilityTargetModal.jsx tests/components/game/AbilityTargetModal.test.jsx
git commit -m "feat: add AbilityTargetModal component"
```

---

## Task 5: Update ActionCardModal — add contextual PLAY button

**Files:**
- Modify: `ti4-companion-web/src/components/game/ActionCardModal.jsx`

`ActionCardModal` receives a `triggerableByActionCardId` prop — a `Map<action_card_id, ability_definition>` built in GameScreen from the `triggerable` list. Each card in hand is matched against this map via `card.action_card_id`. Cards with a triggerable ability show a PLAY button; all cards retain DISCARD.

- [ ] **Step 1: Read the current file**

Read `ti4-companion-web/src/components/game/ActionCardModal.jsx` to understand the existing card render structure before modifying.

- [ ] **Step 2: Add `triggerableByActionCardId` and `onPlay` props; add PLAY button to each card row**

Replace the `export default function ActionCardModal` signature and card render block. The full file becomes:

```jsx
import { deriveHandState } from '../../lib/handState.js'

const TIMING_COLOURS = {
  Action: 'text-plasma',
  Agenda: 'text-gold',
  Component: 'text-success',
}

export default function ActionCardModal({ cards, onDraw, onDiscard, onClose, triggerableByActionCardId = new Map(), onPlay }) {
  const { mustDiscard } = deriveHandState(cards)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-lg flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="label">ACTION CARDS ({cards.length}/7)</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {mustDiscard && (
          <div className="bg-danger/20 border border-danger rounded px-3 py-2 text-danger text-xs font-body">
            Hand limit exceeded — discard down to 7 before continuing.
          </div>
        )}

        {!mustDiscard && (
          <button className="btn-primary text-xs self-start" onClick={onDraw}>
            DRAW CARD
          </button>
        )}

        {cards.length === 0 && (
          <p className="text-dim text-sm font-body">Your hand is empty.</p>
        )}

        <div className="flex flex-col gap-3">
          {cards.map(card => {
            const triggerableAbility = triggerableByActionCardId.get(card.action_card_id)
            const isPlayable = !!triggerableAbility
            return (
              <div key={card.id} className="panel-inset flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-body text-bright text-sm">{card.action_cards.name}</span>
                  <span className={`label text-xs ${TIMING_COLOURS[card.action_cards.timing] ?? 'text-muted'}`}>
                    {card.action_cards.timing}
                  </span>
                </div>
                <p className="text-dim text-xs font-body">{card.action_cards.text}</p>
                <div className="flex gap-2 self-end mt-1">
                  {isPlayable && (
                    <button
                      className="btn-primary text-xs"
                      onClick={() => onPlay?.(card, triggerableAbility)}
                    >
                      PLAY
                    </button>
                  )}
                  <button
                    className="btn-ghost text-xs"
                    onClick={() => onDiscard(card.id)}
                  >
                    PLAY / DISCARD
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass (ActionCardModal tests still pass because `triggerableByActionCardId` defaults to an empty Map).

- [ ] **Step 4: Commit**

```bash
git add src/components/game/ActionCardModal.jsx
git commit -m "feat: add contextual PLAY button to ActionCardModal"
```

---

## Task 6: Update MyPanelSection — add FactionAbilitiesSection

**Files:**
- Modify: `ti4-companion-web/src/components/game/MyPanelSection.jsx`

Adds two new sub-sections:
1. **Faction Abilities** — lists faction abilities from the `factionAbilities` prop. ACTION-timed abilities are rendered as buttons (enabled when in `triggerableAbilityIds`); passive abilities show as static text labels.
2. **Commander unlock prompt** — if `unlockableCommanderAbility` is non-null, shows an UNLOCK button.

- [ ] **Step 1: Read the current file**

Read `ti4-companion-web/src/components/game/MyPanelSection.jsx` to understand the existing layout structure and prop list before modifying.

- [ ] **Step 2: Add new props and sub-sections**

Add `factionAbilities`, `triggerableAbilityIds`, `unlockableCommanderAbility`, `onPlayAbility`, and `onUnlockCommander` to the destructured props, and add the two new sub-sections to the JSX.

The new prop signature:
```jsx
export default function MyPanelSection({
  player, planets, isActive, game,
  onPass, onEndTurn, onUpdateTokens,
  onExhaustPlanet, onReadyPlanet,
  onPickStrategyCard, onUpdateCommodities, onUpdateTradeGoods, onCycleLeader,
  onOpenActionCards, onViewTech,
  factionAbilities = [],
  triggerableAbilityIds = new Set(),
  unlockableCommanderAbility = null,
  onPlayAbility,
  onUnlockCommander,
}) {
```

Add the following two blocks at the bottom of the returned JSX, after the Action Cards button and before the closing `</div>`:

```jsx
      {/* Faction Abilities */}
      {factionAbilities.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="label text-xs">FACTION ABILITIES</p>
          {factionAbilities.map(ability => {
            const isActionTimed = ability.trigger?.event === 'PLAYER_ACTION'
            const isPlayable = triggerableAbilityIds.has(ability.id)
            return isActionTimed ? (
              <button
                key={ability.id}
                className={isPlayable ? 'btn-primary text-xs self-start' : 'btn-ghost text-xs self-start opacity-50'}
                disabled={!isPlayable}
                onClick={() => isPlayable && onPlayAbility?.(ability)}
              >
                {ability.ability_name.toUpperCase()}
              </button>
            ) : (
              <p key={ability.id} className="text-dim text-xs font-body">
                <span className="text-muted">{ability.ability_name}:</span> passive
              </p>
            )
          })}
        </div>
      )}

      {/* Commander unlock */}
      {unlockableCommanderAbility && (
        <div className="panel-inset flex items-center justify-between gap-3">
          <p className="text-gold text-xs font-body">
            Commander unlockable: {unlockableCommanderAbility.ability_name}
          </p>
          <button className="btn-primary text-xs" onClick={() => onUnlockCommander?.(unlockableCommanderAbility)}>
            UNLOCK
          </button>
        </div>
      )}
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass (new props default to safe values so existing tests are unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/components/game/MyPanelSection.jsx
git commit -m "feat: add FactionAbilitiesSection and commander unlock prompt to MyPanelSection"
```

---

## Task 7: Wire everything into GameScreen

**Files:**
- Modify: `ti4-companion-web/src/components/game/GameScreen.jsx`

- [ ] **Step 1: Read the current file**

Read `ti4-companion-web/src/components/game/GameScreen.jsx` in full before modifying.

- [ ] **Step 2: Update GameScreen**

Replace the file with the following:

```jsx
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useGame } from '../../hooks/useGame.js'
import { useGameEvents } from '../../hooks/useGameEvents.js'
import { useAbilities } from '../../hooks/useAbilities.js'
import { resolveAbility, unlockCommander } from '../../lib/edgeFunctions.js'
import { deriveActivePlayer, deriveSpeaker } from '../../lib/gameUtils.js'
import GameHeader from './GameHeader.jsx'
import ScoreboardSection from './ScoreboardSection.jsx'
import MyPanelSection from './MyPanelSection.jsx'
import ObjectivesSection from './ObjectivesSection.jsx'
import HostControlsSection from './HostControlsSection.jsx'
import TechTreeModal from './TechTreeModal.jsx'
import ActionCardModal from './ActionCardModal.jsx'
import AbilityNotificationBar from './AbilityNotificationBar.jsx'
import AbilityTargetModal from './AbilityTargetModal.jsx'

export default function GameScreen({ userId }) {
  const { code } = useParams()
  const {
    game, players, objectives, planets, myCards, currentPlayer, isHost, loading, error,
    endTheTurn, passTheAction, advanceThePhase,
    scoreAnObjective, revealAnObjective, shuffleTheDeck,
    updateTokens, exhaustPlanet, readyPlanet,
    pickStrategyCard, updateCommodities, updateTradeGoods, cycleLeader,
    drawTheActionCard, discardTheActionCard,
  } = useGame(code, userId)

  const [allTechnologies, setAllTechnologies] = useState([])
  const [allAbilityDefinitions, setAllAbilityDefinitions] = useState([])
  const [viewingTechPlayerId, setViewingTechPlayerId] = useState(null)
  const [actionCardModalOpen, setActionCardModalOpen] = useState(false)
  const [activatingAbility, setActivatingAbility] = useState(null)

  useEffect(() => {
    supabase
      .from('technologies')
      .select('*')
      .then(({ data }) => { if (data) setAllTechnologies(data) })
  }, [])

  useEffect(() => {
    supabase
      .from('ability_definitions')
      .select('*, ability_sources(*)')
      .then(({ data }) => { if (data) setAllAbilityDefinitions(data) })
  }, [])

  const { currentEvent } = useGameEvents(game, players, currentPlayer)

  // Build playerSources for useAbilities
  const myPlanets = planets.filter(p => p.player_id === currentPlayer?.id)
  const heldCardIds = myCards.map(c => c.action_card_id)

  // Compute scored objectives count for unlock condition evaluation
  const scoredObjectivesCount = useMemo(() => {
    if (!objectives || !currentPlayer) return 0
    return objectives.filter(o => o.scored_by?.includes(currentPlayer.id)).length
  }, [objectives, currentPlayer])

  // Identify locked commander ability IDs for unlock detection
  const lockedCommanderAbilityIds = useMemo(() => {
    if (!currentPlayer?.leaders || currentPlayer.leaders.commander !== 'locked') return []
    return allAbilityDefinitions
      .filter(a =>
        a.unlock_conditions?.length > 0 &&
        a.ability_sources?.some(s => s.source_type === 'leader')
      )
      .map(a => a.id)
  }, [allAbilityDefinitions, currentPlayer?.leaders?.commander])

  const playerSources = currentPlayer ? {
    playerId: currentPlayer.id,
    factionName: currentPlayer.faction,
    actionCardIds: heldCardIds,
    leaderIds: [],
    relicIds: [],
    promissoryNoteIds: [],
    technologyIds: currentPlayer.technologies ?? [],
    explorationCardIds: [],
    scoredObjectivesCount,
    vp: currentPlayer.vp,
    lockedCommanderAbilityIds,
  } : null

  const { triggerable, unlockable } = useAbilities(currentEvent, playerSources, allAbilityDefinitions)

  const triggerableAbilityIds = useMemo(
    () => new Set(triggerable.map(a => a.id)),
    [triggerable]
  )

  // Map from action_card_id → ability_definition for ActionCardModal PLAY buttons
  const triggerableByActionCardId = useMemo(() => {
    const map = new Map()
    for (const ability of triggerable) {
      const sources = ability.ability_sources?.filter(s => s.source_type === 'action_card') ?? []
      for (const source of sources) {
        if (source.source_id) map.set(source.source_id, ability)
      }
    }
    return map
  }, [triggerable])

  // Faction abilities for MyPanelSection
  const factionAbilities = useMemo(() => {
    if (!currentPlayer?.faction) return []
    return allAbilityDefinitions.filter(a =>
      a.ability_sources?.some(s =>
        s.source_type === 'faction_ability' && s.faction_name === currentPlayer.faction
      )
    )
  }, [allAbilityDefinitions, currentPlayer?.faction])

  const unlockableCommanderAbility = unlockable[0] ?? null

  async function handlePlayAbility(ability, sourceId = null, sourceType = 'faction_ability') {
    const needsSelection = (ability.effects ?? []).some(op =>
      op.target === 'chosen_player' ||
      op.target === 'chosen_planet' ||
      op.amount === 'chosen_amount' ||
      op.op === 'choose_one'
    )
    if (needsSelection) {
      setActivatingAbility({ ability, sourceId, sourceType })
    } else {
      await resolveAbility(game.id, ability.id, sourceType, sourceId, {})
    }
  }

  async function handleConfirmAbility({ ability_definition_id, source_type, source_id, selections }) {
    await resolveAbility(game.id, ability_definition_id, source_type, source_id, selections)
    setActivatingAbility(null)
  }

  async function handleUnlockCommander(ability) {
    await unlockCommander(game.id, ability.id)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-dim font-display text-xs tracking-widest">LOADING…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <span className="text-danger font-body text-sm">{error}</span>
      </div>
    )
  }

  const speaker = deriveSpeaker(players, game)
  const activePlayer = deriveActivePlayer(players, game)

  const viewingPlayer = viewingTechPlayerId
    ? players.find(p => p.id === viewingTechPlayerId) ?? null
    : null
  const viewingPlanets = viewingTechPlayerId
    ? planets.filter(p => p.player_id === viewingTechPlayerId)
    : []

  return (
    <div className="min-h-screen bg-void">
      <GameHeader game={game} speaker={speaker} />
      <AbilityNotificationBar
        triggerable={triggerable.filter(a =>
          !a.ability_sources?.some(s => s.source_type === 'action_card')
        )}
        onPlay={a => handlePlayAbility(a)}
      />
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
        <ScoreboardSection
          players={players}
          game={game}
          currentPlayerId={currentPlayer?.id}
          onViewTech={setViewingTechPlayerId}
        />
        <MyPanelSection
          player={currentPlayer}
          planets={myPlanets}
          isActive={activePlayer?.id === currentPlayer?.id}
          game={game}
          onPass={passTheAction}
          onEndTurn={endTheTurn}
          onUpdateTokens={updateTokens}
          onExhaustPlanet={exhaustPlanet}
          onReadyPlanet={readyPlanet}
          onPickStrategyCard={pickStrategyCard}
          onUpdateCommodities={updateCommodities}
          onUpdateTradeGoods={updateTradeGoods}
          onCycleLeader={cycleLeader}
          onOpenActionCards={() => setActionCardModalOpen(true)}
          onViewTech={() => setViewingTechPlayerId(currentPlayer?.id ?? null)}
          factionAbilities={factionAbilities}
          triggerableAbilityIds={triggerableAbilityIds}
          unlockableCommanderAbility={unlockableCommanderAbility}
          onPlayAbility={a => handlePlayAbility(a)}
          onUnlockCommander={handleUnlockCommander}
        />
        <ObjectivesSection objectives={objectives} players={players} />
        <HostControlsSection
          isHost={isHost}
          game={game}
          players={players}
          objectives={objectives}
          onScoreObjective={scoreAnObjective}
          onRevealObjective={revealAnObjective}
          onShuffleDeck={shuffleTheDeck}
          onAdvancePhase={advanceThePhase}
        />
      </div>

      {actionCardModalOpen && (
        <ActionCardModal
          cards={myCards}
          onDraw={drawTheActionCard}
          onDiscard={discardTheActionCard}
          onClose={() => setActionCardModalOpen(false)}
          triggerableByActionCardId={triggerableByActionCardId}
          onPlay={(card, ability) => handlePlayAbility(ability, card.id, 'action_card')}
        />
      )}

      {activatingAbility && (
        <AbilityTargetModal
          ability={activatingAbility.ability}
          sourceId={activatingAbility.sourceId}
          sourceType={activatingAbility.sourceType}
          players={players}
          planets={myPlanets}
          onConfirm={handleConfirmAbility}
          onClose={() => setActivatingAbility(null)}
        />
      )}

      {viewingPlayer && (
        <TechTreeModal
          player={viewingPlayer}
          planets={viewingPlanets}
          allTechnologies={allTechnologies}
          gameId={game?.id}
          gameExpansions={game?.expansions}
          isOwnTree={viewingPlayer.id === currentPlayer?.id}
          onClose={() => setViewingTechPlayerId(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/game/GameScreen.jsx
git commit -m "feat: wire ability system into GameScreen"
```

---

## Task 8: Smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify the golden path**

1. Start a game and advance to the Agenda phase — confirm `AbilityNotificationBar` appears if any ability definitions with `AGENDA_PHASE_START` trigger have been imported for your faction or held action cards
2. Open Action Cards modal — confirm cards with a matching triggerable ability show a PLAY button alongside DISCARD
3. Click PLAY on an ability that has `chosen_player` target — confirm `AbilityTargetModal` opens with a player picker
4. Select a player and click CONFIRM — confirm the ability resolves (check Supabase table for the expected state change)
5. Import a commander ability definition via the admin UI, ensure the faction matches, score 3 objectives — confirm the UNLOCK banner appears in MyPanelSection
6. Click UNLOCK — confirm the commander status updates in `game_players.leaders`
