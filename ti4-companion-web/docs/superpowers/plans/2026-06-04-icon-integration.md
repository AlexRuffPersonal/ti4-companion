# Icon Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire 59 new SVG icons into the TI4 Companion UI — replacing emoji/text placeholders with `GameIcon` components and adding faction emblems and card type icons.

**Architecture:** All icons served from `public/icons/<category>/<name>.svg` and rendered via the existing `GameIcon` component (`src/components/shared/GameIcon.jsx`). A new `factionIconSlug()` utility maps canonical DB faction names to file slugs. Each task modifies one component and its test file.

**Tech Stack:** React 19, Vite, Vitest 4, @testing-library/react

> **Prerequisite:** SVG files must be generated via Claude Design using `docs/superpowers/specs/2026-06-04-icon-creation-brief-design.md` and placed in their correct `public/icons/` folders. Code changes are valid regardless — missing SVGs show broken images but don't crash the app.

---

### Task 1: Scaffold new icon folders

**Files:**
- Create: `public/icons/fragments/.gitkeep`
- Create: `public/icons/wormholes/.gitkeep`
- Create: `public/icons/anomalies/.gitkeep`
- Create: `public/icons/strategy/.gitkeep`
- Create: `public/icons/factions/.gitkeep`
- Create: `public/icons/cards/.gitkeep`

- [ ] **Step 1: Create folders and gitkeep files**

Run from repo root:
```bash
mkdir -p ti4-companion-web/public/icons/fragments
mkdir -p ti4-companion-web/public/icons/wormholes
mkdir -p ti4-companion-web/public/icons/anomalies
mkdir -p ti4-companion-web/public/icons/strategy
mkdir -p ti4-companion-web/public/icons/factions
mkdir -p ti4-companion-web/public/icons/cards
touch ti4-companion-web/public/icons/fragments/.gitkeep
touch ti4-companion-web/public/icons/wormholes/.gitkeep
touch ti4-companion-web/public/icons/anomalies/.gitkeep
touch ti4-companion-web/public/icons/strategy/.gitkeep
touch ti4-companion-web/public/icons/factions/.gitkeep
touch ti4-companion-web/public/icons/cards/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/public/icons/fragments/.gitkeep \
        ti4-companion-web/public/icons/wormholes/.gitkeep \
        ti4-companion-web/public/icons/anomalies/.gitkeep \
        ti4-companion-web/public/icons/strategy/.gitkeep \
        ti4-companion-web/public/icons/factions/.gitkeep \
        ti4-companion-web/public/icons/cards/.gitkeep
git commit -m "chore: scaffold new icon category folders"
```

---

### Task 2: factionIconSlug utility

**Files:**
- Modify: `ti4-companion-web/src/lib/gameUtils.js`
- Modify: `ti4-companion-web/tests/lib/gameUtils.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/gameUtils.test.js`:

```js
import { factionIconSlug } from '../../src/lib/gameUtils.js'

describe('factionIconSlug', () => {
  it('maps canonical faction names to icon slugs', () => {
    expect(factionIconSlug('The Arborec')).toBe('arborec')
    expect(factionIconSlug('The Barony of Letnev')).toBe('barony')
    expect(factionIconSlug('The Ghosts of Creuss')).toBe('ghosts-creuss')
    expect(factionIconSlug('The Mahact Gene-Sorcerers')).toBe('mahact')
    expect(factionIconSlug("The Vuil'raith Cabal")).toBe('vuil-raith')
  })

  it('is case-insensitive', () => {
    expect(factionIconSlug('the arborec')).toBe('arborec')
    expect(factionIconSlug('THE BARONY OF LETNEV')).toBe('barony')
  })

  it('returns null for unknown or missing values', () => {
    expect(factionIconSlug('Unknown Faction')).toBeNull()
    expect(factionIconSlug(null)).toBeNull()
    expect(factionIconSlug(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/lib/gameUtils.test.js
```
Expected: FAIL — `factionIconSlug is not a function`

- [ ] **Step 3: Implement in gameUtils.js**

Append to the bottom of `src/lib/gameUtils.js`:

```js
const FACTION_ICON_MAP = new Map([
  ['the arborec', 'arborec'],
  ['the barony of letnev', 'barony'],
  ['the clan of saar', 'clan-saar'],
  ['the embers of muaat', 'embers-muaat'],
  ['the emirates of hacan', 'emirates-hacan'],
  ['the federation of sol', 'federation-sol'],
  ['the ghosts of creuss', 'ghosts-creuss'],
  ['the l1z1x mindnet', 'l1z1x'],
  ['the mentak coalition', 'mentak'],
  ['the naalu collective', 'naalu'],
  ['the nekro virus', 'nekro-virus'],
  ["the sardakk n'orr", 'sardakk-norr'],
  ['the universities of jol-nar', 'jol-nar'],
  ['the winnu', 'winnu'],
  ['the xxcha kingdom', 'xxcha'],
  ['the yin brotherhood', 'yin'],
  ['the yssaril tribes', 'yssaril'],
  ['the argent flight', 'argent-flight'],
  ['the empyrean', 'empyrean'],
  ['the mahact gene-sorcerers', 'mahact'],
  ['the naaz-rokha alliance', 'naaz-rokha'],
  ['the nomad', 'nomad'],
  ['the titans of ul', 'titans'],
  ["the vuil'raith cabal", 'vuil-raith'],
])

export function factionIconSlug(factionName) {
  if (!factionName) return null
  return FACTION_ICON_MAP.get(factionName.toLowerCase()) ?? null
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ti4-companion-web && npx vitest run tests/lib/gameUtils.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/lib/gameUtils.js \
        ti4-companion-web/tests/lib/gameUtils.test.js
git commit -m "feat: add factionIconSlug utility"
```

---

### Task 3: Speaker icon in GameHeader

**Files:**
- Modify: `ti4-companion-web/src/components/game/GameHeader.jsx`
- Create: `ti4-companion-web/tests/components/game/GameHeader.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/game/GameHeader.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameHeader from '../../../src/components/game/GameHeader.jsx'

const GAME = { round: 2, phase: 'action', vp_goal: 10 }
const SPEAKER = { display_name: 'Alice' }

describe('GameHeader', () => {
  it('renders round number', () => {
    render(<GameHeader game={GAME} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.getByText(/round 2/i)).toBeInTheDocument()
  })

  it('renders speaker name', () => {
    render(<GameHeader game={GAME} speaker={SPEAKER} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
  })

  it('renders speaker icon when speaker is set', () => {
    render(<GameHeader game={GAME} speaker={SPEAKER} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'speaker' })).toBeInTheDocument()
  })

  it('does not render speaker icon when no speaker', () => {
    render(<GameHeader game={GAME} onOpenTradeLog={vi.fn()} onOpenRules={vi.fn()} />)
    expect(screen.queryByRole('img', { name: 'speaker' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/GameHeader.test.jsx
```
Expected: FAIL — `Unable to find role="img" with name "speaker"`

- [ ] **Step 3: Update GameHeader.jsx**

Replace line 15 in `src/components/game/GameHeader.jsx`:

```jsx
// Before:
{speaker && <> · 🎙 {speaker.display_name}</>}

// After:
{speaker && <> · <GameIcon category="economy" name="speaker" size={14} alt="speaker" className="inline" /> {speaker.display_name}</>}
```

Also add the import at the top of the file:

```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/GameHeader.test.jsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/GameHeader.jsx \
        ti4-companion-web/tests/components/game/GameHeader.test.jsx
git commit -m "feat: replace speaker emoji with GameIcon in GameHeader"
```

---

### Task 4: Planet trait icons in SystemInfoModal

**Files:**
- Modify: `ti4-companion-web/src/components/game/SystemInfoModal.jsx`
- Modify: `ti4-companion-web/tests/components/game/SystemInfoModal.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('SystemInfoModal')` block in `tests/components/game/SystemInfoModal.test.jsx`:

```jsx
it('renders planet trait icon for each trait', () => {
  renderModal()
  // planet fixture has type: ['cultural']
  expect(screen.getByRole('img', { name: 'cultural' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/SystemInfoModal.test.jsx
```
Expected: FAIL — `Unable to find role="img" with name "cultural"`

- [ ] **Step 3: Update SystemInfoModal.jsx**

Add import at the top:
```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

Replace lines 36–40 in `src/components/game/SystemInfoModal.jsx`:

```jsx
// Before:
{(p.type ?? []).length > 0 &&
  <div className="flex gap-1">
    {p.type.map(t => (
      <span key={t} className="text-dim text-xs font-body uppercase">{t}</span>
    ))}
  </div>
}

// After:
{(p.type ?? []).length > 0 &&
  <div className="flex gap-1 items-center">
    {p.type.map(t => (
      <span key={t} className="flex items-center gap-1 text-dim text-xs font-body uppercase">
        <GameIcon category="planet" name={t} size={12} alt={t} />
        {t}
      </span>
    ))}
  </div>
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/SystemInfoModal.test.jsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/SystemInfoModal.jsx \
        ti4-companion-web/tests/components/game/SystemInfoModal.test.jsx
git commit -m "feat: add planet trait icons in SystemInfoModal"
```

---

### Task 5: Wormhole & anomaly icons in SystemInfoModal

**Files:**
- Modify: `ti4-companion-web/src/components/game/SystemInfoModal.jsx`
- Modify: `ti4-companion-web/tests/components/game/SystemInfoModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to the `describe('SystemInfoModal')` block in `tests/components/game/SystemInfoModal.test.jsx`:

```jsx
it('renders wormhole icon for each wormhole', () => {
  renderModal({ planets: [], wormholes: ['alpha'] })
  expect(screen.getByRole('img', { name: 'alpha' })).toBeInTheDocument()
})

it('renders anomaly icon for each anomaly', () => {
  renderModal({ planets: [], anomalies: ['gravity_rift'] })
  expect(screen.getByRole('img', { name: 'gravity_rift' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/SystemInfoModal.test.jsx
```
Expected: FAIL — the two new tests fail; existing tests still pass

- [ ] **Step 3: Update SystemInfoModal.jsx**

Replace lines 45–57 in `src/components/game/SystemInfoModal.jsx` (`GameIcon` is already imported from Task 4):

```jsx
// Before:
{wormholes.length > 0 && (
  <div>
    <p className="label">WORMHOLES</p>
    <p className="text-muted text-xs">{wormholes.join(', ')}</p>
  </div>
)}

{anomalies.length > 0 && (
  <div>
    <p className="label">ANOMALIES</p>
    <p className="text-muted text-xs">{anomalies.join(', ')}</p>
  </div>
)}

// After:
{wormholes.length > 0 && (
  <div>
    <p className="label">WORMHOLES</p>
    <div className="flex flex-wrap gap-2 mt-1">
      {wormholes.map(w => (
        <span key={w} className="flex items-center gap-1 text-muted text-xs font-body capitalize">
          <GameIcon category="wormholes" name={w} size={14} alt={w} />
          {w}
        </span>
      ))}
    </div>
  </div>
)}

{anomalies.length > 0 && (
  <div>
    <p className="label">ANOMALIES</p>
    <div className="flex flex-wrap gap-2 mt-1">
      {anomalies.map(a => (
        <span key={a} className="flex items-center gap-1 text-muted text-xs font-body capitalize">
          <GameIcon category="anomalies" name={a} size={14} alt={a} />
          {a.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Run to verify all tests pass**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/SystemInfoModal.test.jsx
```
Expected: PASS (all tests including the pre-existing ones)

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/SystemInfoModal.jsx \
        ti4-companion-web/tests/components/game/SystemInfoModal.test.jsx
git commit -m "feat: add wormhole and anomaly icons in SystemInfoModal"
```

---

### Task 6: Fragment type icons in RelicFragmentPanel

**Files:**
- Modify: `ti4-companion-web/src/components/game/RelicFragmentPanel.jsx`
- Modify: `ti4-companion-web/tests/components/game/RelicFragmentPanel.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('RelicFragmentPanel')` block in `tests/components/game/RelicFragmentPanel.test.jsx`:

```jsx
it('renders a fragment type icon for each group', () => {
  const fragments = makeFragments(['cultural', 1], ['hazardous', 2])
  render(
    <RelicFragmentPanel relicFragments={fragments} isActivePlayer={true} onUseRelicFragment={vi.fn()} />
  )
  expect(screen.getByRole('img', { name: 'cultural' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'hazardous' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/RelicFragmentPanel.test.jsx
```
Expected: FAIL — `Unable to find role="img" with name "cultural"`

- [ ] **Step 3: Update RelicFragmentPanel.jsx**

Add import at the top of `src/components/game/RelicFragmentPanel.jsx`:
```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

Replace lines 55–60 in `src/components/game/RelicFragmentPanel.jsx`:

```jsx
// Before:
<div key={type} className="flex items-center justify-between text-sm font-body">
  <span className="capitalize text-text">{type}</span>
  <span className="text-xs px-2 py-0.5 rounded panel-inset text-bright">{count}</span>
</div>

// After:
<div key={type} className="flex items-center justify-between text-sm font-body">
  <span className="flex items-center gap-2 capitalize text-text">
    <GameIcon category="fragments" name={type} size={16} alt={type} />
    {type}
  </span>
  <span className="text-xs px-2 py-0.5 rounded panel-inset text-bright">{count}</span>
</div>
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/RelicFragmentPanel.test.jsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/RelicFragmentPanel.jsx \
        ti4-companion-web/tests/components/game/RelicFragmentPanel.test.jsx
git commit -m "feat: add fragment type icons in RelicFragmentPanel"
```

---

### Task 7: Strategy card symbols in StrategyCardPanel

**Files:**
- Modify: `ti4-companion-web/src/components/game/StrategyCardPanel.jsx`
- Modify: `ti4-companion-web/tests/components/game/StrategyCardPanel.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to the existing `describe` block in `tests/components/game/StrategyCardPanel.test.jsx`:

```jsx
it('renders strategy card icon in picker button', () => {
  // Render during strategy phase with no card selected
  render(
    <StrategyCardPanel
      player={{ id: 'p1', strategy_card: null }}
      game={{ phase: 'strategy' }}
      allPlayers={[{ id: 'p1', strategy_card: null }]}
      activePay={null}
      isActive={true}
      onPickStrategyCard={vi.fn()}
      onPlayPrimary={vi.fn()}
    />
  )
  // Card 1 = Leadership — icon alt should be "leadership"
  expect(screen.getByRole('img', { name: 'leadership' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/StrategyCardPanel.test.jsx
```
Expected: FAIL — `Unable to find role="img" with name "leadership"`

- [ ] **Step 3: Update StrategyCardPanel.jsx**

Add import at the top of `src/components/game/StrategyCardPanel.jsx`:
```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

Replace lines 29–43 (the card picker button) in `src/components/game/StrategyCardPanel.jsx`:

```jsx
// Before:
return (
  <button
    key={cardNum}
    onClick={() => onPickStrategyCard(cardNum)}
    className="btn-primary text-xs py-2"
  >
    <div className="font-display">{cardNum}</div>
    <div className="text-xs text-muted">{card?.name}</div>
  </button>
)

// After:
return (
  <button
    key={cardNum}
    onClick={() => onPickStrategyCard(cardNum)}
    className="btn-primary text-xs py-2 flex flex-col items-center gap-1"
  >
    <GameIcon category="strategy" name={card?.name?.toLowerCase() ?? cardNum} size={20} alt={card?.name?.toLowerCase() ?? String(cardNum)} />
    <div className="font-display">{cardNum}</div>
    <div className="text-xs text-muted">{card?.name}</div>
  </button>
)
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/StrategyCardPanel.test.jsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/StrategyCardPanel.jsx \
        ti4-companion-web/tests/components/game/StrategyCardPanel.test.jsx
git commit -m "feat: add strategy card icons in StrategyCardPanel picker"
```

---

### Task 8: Hit/miss icons in DiceResultsPanel

**Files:**
- Modify: `ti4-companion-web/src/components/game/DiceResultsPanel.jsx`
- Modify: `ti4-companion-web/tests/components/game/DiceResultsPanel.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('DiceResultsPanel')` block in `tests/components/game/DiceResultsPanel.test.jsx`:

```jsx
it('renders hit icon for each hit die', () => {
  render(<DiceResultsPanel dice={DICE} label="Attacker" />)
  const hitIcons = screen.getAllByRole('img', { name: 'hit' })
  expect(hitIcons).toHaveLength(2) // DICE has 2 hits
})

it('renders miss icon for each miss die', () => {
  render(<DiceResultsPanel dice={DICE} label="Attacker" />)
  const missIcons = screen.getAllByRole('img', { name: 'miss' })
  expect(missIcons).toHaveLength(1) // DICE has 1 miss
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/DiceResultsPanel.test.jsx
```
Expected: FAIL — new tests fail; existing pass

- [ ] **Step 3: Update DiceResultsPanel.jsx**

Add import at top of `src/components/game/DiceResultsPanel.jsx`:
```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

Replace lines 22–32 (the die result span) in `src/components/game/DiceResultsPanel.jsx`:

```jsx
// Before:
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

// After:
{results.map((d, i) => (
  <span
    key={i}
    className={`w-7 h-7 flex items-center justify-center rounded font-mono text-xs font-bold border ${
      d.hit ? 'border-success text-success bg-success/10' : 'border-border text-dim bg-void'
    }`}
    title={d.roll}
  >
    <GameIcon category="dice" name={d.hit ? 'hit' : 'miss'} size={14} alt={d.hit ? 'hit' : 'miss'} />
  </span>
))}
```

Note: The roll number is moved to `title` (tooltip) since the icon replaces the number display. The existing tests that check `screen.getByText('8')` etc. will break — update them:

Replace the `renders each die roll value` test:
```jsx
it('renders each die roll value as title attribute', () => {
  render(<DiceResultsPanel dice={DICE} label="Attacker" />)
  // Roll values now appear as title attributes on the span, not as text
  const spans = document.querySelectorAll('[title]')
  const titles = Array.from(spans).map(s => s.getAttribute('title'))
  expect(titles).toContain('8')
  expect(titles).toContain('3')
  expect(titles).toContain('9')
})
```

- [ ] **Step 4: Run to verify all tests pass**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/DiceResultsPanel.test.jsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/DiceResultsPanel.jsx \
        ti4-companion-web/tests/components/game/DiceResultsPanel.test.jsx
git commit -m "feat: replace dice roll numbers with hit/miss icons in DiceResultsPanel"
```

---

### Task 9: Faction emblems in ScoreboardSection

**Files:**
- Modify: `ti4-companion-web/src/components/game/ScoreboardSection.jsx`
- Modify: `ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to the `describe('ScoreboardSection')` block in `tests/components/game/ScoreboardSection.test.jsx`:

```jsx
it('renders faction emblem icon when faction maps to a known slug', () => {
  // Use full canonical name so factionIconSlug returns a slug
  const players = [
    { ...PLAYERS[0], faction: 'The Arborec' },
    { ...PLAYERS[1], faction: 'The Barony of Letnev' },
    { ...PLAYERS[2], faction: 'The Clan of Saar' },
  ]
  render(
    <ScoreboardSection players={players} game={ACTION_GAME} currentPlayerId="p1" />
  )
  expect(screen.getByRole('img', { name: 'arborec' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'barony' })).toBeInTheDocument()
})

it('renders no faction icon when faction name is unknown', () => {
  renderScoreboard() // uses shorthand names like 'Arborec' which don't match canonical
  expect(screen.queryByRole('img', { name: /arborec/i })).toBeNull()
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/ScoreboardSection.test.jsx
```
Expected: FAIL — new tests fail; existing pass

- [ ] **Step 3: Update ScoreboardSection.jsx**

Add imports at the top of `src/components/game/ScoreboardSection.jsx`:
```jsx
import GameIcon from '../shared/GameIcon.jsx'
import { factionIconSlug } from '../../lib/gameUtils.js'
```

Replace lines 36–38 (faction text span) in `src/components/game/ScoreboardSection.jsx`:

```jsx
// Before:
{player.faction && (
  <span className="text-dim text-xs ml-2">({player.faction})</span>
)}

// After:
{player.faction && (() => {
  const slug = factionIconSlug(player.faction)
  return (
    <span className="flex items-center gap-1 text-dim text-xs ml-2">
      {slug && <GameIcon category="factions" name={slug} size={14} alt={slug} />}
      ({player.faction})
    </span>
  )
})()}
```

- [ ] **Step 4: Run to verify all tests pass**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/ScoreboardSection.test.jsx
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/ScoreboardSection.jsx \
        ti4-companion-web/tests/components/game/ScoreboardSection.test.jsx
git commit -m "feat: add faction emblem icons in ScoreboardSection"
```

---

### Task 10: Card type icons in modal headers

**Files:**
- Modify: `ti4-companion-web/src/components/game/ActionCardModal.jsx`
- Modify: `ti4-companion-web/src/components/game/RelicPanel.jsx`
- Modify: `ti4-companion-web/src/components/game/PromissoryNotesModal.jsx`
- Modify: `ti4-companion-web/tests/components/game/ActionCardModal.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to the `describe` block in `tests/components/game/ActionCardModal.test.jsx`:

```jsx
it('renders action card icon in panel header', () => {
  render(<ActionCardModal cards={[]} onClose={vi.fn()} onPlay={vi.fn()} />)
  expect(screen.getByRole('img', { name: 'action' })).toBeInTheDocument()
})
```

Add to the `describe` block in `tests/components/game/PromissoryNotesModal.test.jsx`:

```jsx
it('renders promissory note icon in panel header', () => {
  render(<PromissoryNotesModal notes={[]} onClose={vi.fn()} onPlay={vi.fn()} currentPlayerId="p1" allPlayers={[]} />)
  expect(screen.getByRole('img', { name: 'promissory' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/ActionCardModal.test.jsx tests/components/game/PromissoryNotesModal.test.jsx
```
Expected: FAIL — the two new icon tests fail; existing tests pass

- [ ] **Step 3: Update the three modal files**

**ActionCardModal.jsx** — add import and update label on line 19:
```jsx
import GameIcon from '../shared/GameIcon.jsx'

// Before:
<p className="label">ACTION CARDS ({cards.length}/7)</p>

// After:
<p className="label flex items-center gap-2">
  <GameIcon category="cards" name="action" size={14} alt="action" />
  ACTION CARDS ({cards.length}/7)
</p>
```

**RelicPanel.jsx** — add import and update label on line 88:
```jsx
import GameIcon from '../shared/GameIcon.jsx'

// Before:
<p className="label">RELICS</p>

// After:
<p className="label flex items-center gap-2">
  <GameIcon category="cards" name="relic" size={14} alt="relic" />
  RELICS
</p>
```

**PromissoryNotesModal.jsx** — add import and update label on line 16:
```jsx
import GameIcon from '../shared/GameIcon.jsx'

// Before:
<p className="label">MY PROMISSORY NOTES</p>

// After:
<p className="label flex items-center gap-2">
  <GameIcon category="cards" name="promissory" size={14} alt="promissory" />
  MY PROMISSORY NOTES
</p>
```

- [ ] **Step 4: Run to verify all pass**

```bash
cd ti4-companion-web && npx vitest run tests/components/game/ActionCardModal.test.jsx tests/components/game/PromissoryNotesModal.test.jsx
```
Expected: PASS

Run the full suite to check for regressions:
```bash
cd ti4-companion-web && npm test
```
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add ti4-companion-web/src/components/game/ActionCardModal.jsx \
        ti4-companion-web/src/components/game/RelicPanel.jsx \
        ti4-companion-web/src/components/game/PromissoryNotesModal.jsx \
        ti4-companion-web/tests/components/game/ActionCardModal.test.jsx \
        ti4-companion-web/tests/components/game/PromissoryNotesModal.test.jsx
git commit -m "feat: add card type icons in ActionCardModal, RelicPanel, PromissoryNotesModal"
```

---

> **Note — B3 scaffolding-only icons:** `tokens/activation.svg`, `economy/production.svg`, and `tokens/frontier.svg` are scaffolded by Task 1 but have no component wiring in this plan. Their natural integration points (HexTile activation markers, ProductionModal header, ExplorationModal frontier token) require broader component work outside the scope of this icon integration pass. Add them when those components are next modified.

