# SVG Icon Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the existing SVG icons from `public/icons/` into five UI locations: `GameIcon` shared component, TechCard type indicator, MyPanelSection token/planet display, LeaderCard type badge, and HexTile unit icons.

**Architecture:** A new `GameIcon` component renders `<img src="/icons/{category}/{name}.svg">` for HTML context and exports `SvgImageIcon` for SVG context (HexTile). No build tooling changes — icons ship with baked-in game colours. Each component is modified independently and tested with TDD.

**Tech Stack:** React 19, Vitest 4, @testing-library/react, SVG `<image>` elements

---

## File Map

| Action | File |
|--------|------|
| Create | `src/components/shared/GameIcon.jsx` |
| Create | `tests/components/shared/GameIcon.test.jsx` |
| Modify | `src/components/game/TechCard.jsx` |
| Modify | `tests/components/TechCard.test.jsx` |
| Modify | `src/components/game/MyPanelSection.jsx` |
| Modify | `tests/components/game/MyPanelSection.test.jsx` |
| Modify | `src/components/game/LeaderCard.jsx` |
| Create | `tests/components/game/LeaderCard.test.jsx` |
| Modify | `src/components/game/HexTile.jsx` |
| Modify | `tests/components/game/HexTile.test.jsx` |

---

## Task 1: GameIcon shared component

**Files:**
- Create: `src/components/shared/GameIcon.jsx`
- Create: `tests/components/shared/GameIcon.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/shared/GameIcon.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GameIcon, { SvgImageIcon } from '../../../src/components/shared/GameIcon.jsx'

describe('GameIcon', () => {
  it('renders img with correct src path', () => {
    render(<GameIcon category="tech" name="biotic" />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('/icons/tech/biotic.svg')
  })

  it('uses name as alt when alt not provided', () => {
    render(<GameIcon category="tech" name="biotic" />)
    expect(screen.getByAltText('biotic')).toBeTruthy()
  })

  it('uses provided alt text', () => {
    render(<GameIcon category="tech" name="biotic" alt="Biotic technology" />)
    expect(screen.getByAltText('Biotic technology')).toBeTruthy()
  })

  it('applies default size of 16', () => {
    render(<GameIcon category="tech" name="biotic" />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('width')).toBe('16')
    expect(img.getAttribute('height')).toBe('16')
  })

  it('applies custom size', () => {
    render(<GameIcon category="tokens" name="tactic" size={22} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('width')).toBe('22')
    expect(img.getAttribute('height')).toBe('22')
  })

  it('applies className to img', () => {
    render(<GameIcon category="tech" name="biotic" className="opacity-50" />)
    expect(screen.getByRole('img').className).toContain('opacity-50')
  })
})

describe('SvgImageIcon', () => {
  it('renders SVG image element with correct href', () => {
    const { container } = render(
      <svg><SvgImageIcon category="units" name="carrier" x={10} y={20} size={12} /></svg>
    )
    const image = container.querySelector('image')
    expect(image).toBeTruthy()
    expect(image.getAttribute('href')).toBe('/icons/units/carrier.svg')
  })

  it('applies x, y, width, height to image element', () => {
    const { container } = render(
      <svg><SvgImageIcon category="units" name="carrier" x={10} y={20} size={12} /></svg>
    )
    const image = container.querySelector('image')
    expect(image.getAttribute('x')).toBe('10')
    expect(image.getAttribute('y')).toBe('20')
    expect(image.getAttribute('width')).toBe('12')
    expect(image.getAttribute('height')).toBe('12')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ti4-companion-web
npx vitest run tests/components/shared/GameIcon.test.jsx
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the GameIcon component**

Create `src/components/shared/GameIcon.jsx`:

```jsx
export default function GameIcon({ category, name, size = 16, className, alt }) {
  return (
    <img
      src={`/icons/${category}/${name}.svg`}
      width={size}
      height={size}
      alt={alt ?? name}
      className={className}
    />
  )
}

export function SvgImageIcon({ category, name, x, y, size, ...props }) {
  return (
    <image
      href={`/icons/${category}/${name}.svg`}
      x={x}
      y={y}
      width={size}
      height={size}
      {...props}
    />
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/shared/GameIcon.test.jsx
```

Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/GameIcon.jsx tests/components/shared/GameIcon.test.jsx
git commit -m "feat: add GameIcon and SvgImageIcon shared components"
```

---

## Task 2: TechCard — replace prereq dots with tech type icon

**Files:**
- Modify: `src/components/game/TechCard.jsx`
- Modify: `tests/components/TechCard.test.jsx`

The existing tests check for `prereq-dot-filled` and `prereq-dot-empty` testids, which will be removed. Those tests must be replaced with type icon tests.

- [ ] **Step 1: Write the new/updated tests**

Open `tests/components/TechCard.test.jsx`. Add these tests and **remove** the two prereq-dot tests (`'renders filled prereq dots...'` and `'renders empty prereq dots...'`):

```jsx
// Add at top of file:
import GameIcon from '../../src/components/shared/GameIcon.jsx'

// Add these tests inside the describe block:
it('renders biotic type icon for green technology', () => {
  render(<TechCard tech={{ ...BASE_TECH, technology_type: 'green' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
  const img = screen.getByRole('img')
  expect(img.getAttribute('src')).toBe('/icons/tech/biotic.svg')
  expect(screen.getByTestId('tech-type-icon-row')).toBeTruthy()
})

it('renders propulsion type icon for blue technology', () => {
  render(<TechCard tech={{ ...BASE_TECH, technology_type: 'blue' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/icons/tech/propulsion.svg')
})

it('renders cybernetic type icon for yellow technology', () => {
  render(<TechCard tech={{ ...BASE_TECH, technology_type: 'yellow' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/icons/tech/cybernetic.svg')
})

it('renders warfare type icon for red technology', () => {
  render(<TechCard tech={{ ...BASE_TECH, technology_type: 'red' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
  expect(screen.getByRole('img').getAttribute('src')).toBe('/icons/tech/warfare.svg')
})

it('renders no type icon for unit_upgrade technology', () => {
  render(<TechCard tech={{ ...BASE_TECH, technology_type: 'unit_upgrade' }} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
  expect(screen.queryByTestId('tech-type-icon-row')).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
})

it('still shows missing prereq text for unavailable techs', () => {
  const tech = { ...BASE_TECH, status: 'unavailable', missingPrereqs: [{ colour: 'green', count: 1 }] }
  render(<TechCard tech={tech} isOwnTree={false} isSelected={false} onSelect={vi.fn()} />)
  expect(screen.getByText(/Missing: 1 green/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

```bash
npx vitest run tests/components/TechCard.test.jsx
```

Expected: new icon tests FAIL (no icon rendered yet), prereq-dot tests now removed

- [ ] **Step 3: Update TechCard.jsx**

In `src/components/game/TechCard.jsx`:

1. Add import at the top:
```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

2. Add the type icon map after the existing `STATUS_BORDER` constant:
```jsx
const TECH_TYPE_ICON = {
  green: 'biotic',
  blue: 'propulsion',
  yellow: 'cybernetic',
  red: 'warfare',
}
```

3. Remove the entire `COLOUR_DOT` constant and the prereq dots block inside the JSX return:
```jsx
// REMOVE this entire block:
{dots.length > 0 && (
  <div className="flex gap-1 mb-1">
    {dots.map((dot, i) => ...)}
  </div>
)}
```

4. Also remove the `dots` array build logic (the `for...of Object.entries(prereqs)` loop).

5. Replace with type icon row before the `{/* Name + expand toggle */}` comment:
```jsx
{TECH_TYPE_ICON[tech.technology_type] && (
  <div data-testid="tech-type-icon-row" className="flex items-center gap-1 mb-1">
    <GameIcon
      category="tech"
      name={TECH_TYPE_ICON[tech.technology_type]}
      size={16}
      alt={TECH_TYPE_ICON[tech.technology_type]}
    />
    <span className="text-xs font-mono" style={{ color: 'inherit' }}>
      {TECH_TYPE_ICON[tech.technology_type].toUpperCase()}
    </span>
  </div>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/TechCard.test.jsx
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/game/TechCard.jsx tests/components/TechCard.test.jsx
git commit -m "feat: replace TechCard prereq dots with tech type icon"
```

---

## Task 3: MyPanelSection — token icons and planet resource/influence icons

**Files:**
- Modify: `src/components/game/MyPanelSection.jsx`
- Modify: `tests/components/game/MyPanelSection.test.jsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/game/MyPanelSection.test.jsx` inside the `describe` block:

```jsx
it('renders tactic token icon', () => {
  renderPanel()
  const imgs = screen.getAllByRole('img')
  const tacticImg = imgs.find(i => i.getAttribute('src') === '/icons/tokens/tactic.svg')
  expect(tacticImg).toBeTruthy()
})

it('renders fleet token icon', () => {
  renderPanel()
  const imgs = screen.getAllByRole('img')
  expect(imgs.find(i => i.getAttribute('src') === '/icons/tokens/fleet.svg')).toBeTruthy()
})

it('renders strategy token icon', () => {
  renderPanel()
  const imgs = screen.getAllByRole('img')
  expect(imgs.find(i => i.getAttribute('src') === '/icons/tokens/strategy.svg')).toBeTruthy()
})

it('renders commodity icon', () => {
  renderPanel()
  const imgs = screen.getAllByRole('img')
  expect(imgs.find(i => i.getAttribute('src') === '/icons/economy/commodity.svg')).toBeTruthy()
})

it('renders trade-good icon', () => {
  renderPanel()
  const imgs = screen.getAllByRole('img')
  expect(imgs.find(i => i.getAttribute('src') === '/icons/economy/trade-good.svg')).toBeTruthy()
})

it('renders resource and influence icons for planet when planetStaticMap provided', () => {
  renderPanel({
    planetStaticMap: {
      'Mecatol Rex': { resources: 1, influence: 6, tech_specialty: null, traits: [] },
      'Jord': { resources: 4, influence: 2, tech_specialty: null, traits: [] },
    }
  })
  const imgs = screen.getAllByRole('img')
  expect(imgs.some(i => i.getAttribute('src') === '/icons/planet/resource.svg')).toBeTruthy()
  expect(imgs.some(i => i.getAttribute('src') === '/icons/planet/influence.svg')).toBeTruthy()
})

it('shows planet resource and influence values as text when planetStaticMap provided', () => {
  renderPanel({
    planetStaticMap: {
      'Mecatol Rex': { resources: 1, influence: 6, tech_specialty: null, traits: [] },
    }
  })
  expect(screen.getByText('1')).toBeInTheDocument()
  expect(screen.getByText('6')).toBeInTheDocument()
})

it('does not render slash-format resource/influence text', () => {
  renderPanel({
    planetStaticMap: {
      'Mecatol Rex': { resources: 1, influence: 6, tech_specialty: null, traits: [] },
    }
  })
  expect(screen.queryByText('1/6')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

Expected: all new tests FAIL

- [ ] **Step 3: Update MyPanelSection.jsx — token icons**

Add import at the top of `src/components/game/MyPanelSection.jsx`:

```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

Add the token icon mapping before the component function:

```jsx
const TOKEN_ICONS = { tactic_total: 'tactic', fleet: 'fleet', strategy: 'strategy' }
```

In the token counters section (the `.map(({ key, label }) => ...)` block), insert a `GameIcon` between the label paragraph and the value display. The full updated token item:

```jsx
{[
  { key: 'tactic_total', label: 'TACTIC' },
  { key: 'fleet',        label: 'FLEET' },
  { key: 'strategy',     label: 'STRATEGY' },
].map(({ key, label }) => (
  <div key={key} className="text-center">
    <p className="label text-xs">{label}</p>
    <GameIcon category="tokens" name={TOKEN_ICONS[key]} size={22} alt={label.toLowerCase()} />
    {isStatusPhase ? (
      <div className="flex items-center gap-1">
        <button
          className="counter-btn"
          onClick={() => setDraftTokens(t => ({ ...t, [key]: Math.max(0, t[key] - 1) }))}
        >−</button>
        <input
          type="text"
          readOnly
          value={draftTokens[key]}
          aria-label={`${label.toLowerCase()} tokens`}
          className="font-display text-bright text-lg w-6 text-center bg-transparent border-none outline-none"
        />
        <button
          className="counter-btn"
          onClick={() => setDraftTokens(t => ({ ...t, [key]: t[key] + 1 }))}
        >+</button>
      </div>
    ) : (
      <input
        type="text"
        readOnly
        value={tokens[key]}
        aria-label={`${label.toLowerCase()} tokens`}
        className="font-display text-bright text-lg w-8 text-center bg-transparent border-none outline-none"
      />
    )}
  </div>
))}
```

In the COMMOD. item, insert icon between label and counter:

```jsx
<div className="text-center">
  <p className="label text-xs">COMMOD.</p>
  <GameIcon category="economy" name="commodity" size={22} alt="commodity" />
  <div className="flex items-center gap-1">
    <button className="counter-btn" onClick={() => onUpdateCommodities(Math.max(0, player.commodities - 1))}>−</button>
    <span className="font-display text-bright text-lg">{player.commodities}</span>
    <button className="counter-btn" onClick={() => onUpdateCommodities(player.commodities + 1)}>+</button>
  </div>
</div>
```

In the TRADE item, insert icon between label and counter:

```jsx
<div className="text-center">
  <p className="label text-xs">TRADE</p>
  <GameIcon category="economy" name="trade-good" size={22} alt="trade good" />
  <div className="flex items-center gap-1">
    <button className="counter-btn" onClick={() => onUpdateTradeGoods(Math.max(0, player.trade_goods - 1))}>−</button>
    <span className="font-display text-bright text-lg">{player.trade_goods}</span>
    <button className="counter-btn" onClick={() => onUpdateTradeGoods(player.trade_goods + 1)}>+</button>
  </div>
</div>
```

- [ ] **Step 4: Update MyPanelSection.jsx — planet resource/influence icons**

Find the planet resource/influence span (currently `{staticInfo.resources}/{staticInfo.influence}`):

```jsx
// REMOVE:
<span className="text-muted text-xs shrink-0">
  {staticInfo.resources}/{staticInfo.influence}
</span>

// REPLACE WITH:
<span className="flex items-center gap-1 text-muted text-xs shrink-0">
  <GameIcon category="planet" name="resource" size={12} alt="resource" />
  <span>{staticInfo.resources}</span>
  <GameIcon category="planet" name="influence" size={12} alt="influence" />
  <span>{staticInfo.influence}</span>
</span>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/MyPanelSection.test.jsx
```

Expected: All tests PASS (existing + new)

- [ ] **Step 6: Commit**

```bash
git add src/components/game/MyPanelSection.jsx tests/components/game/MyPanelSection.test.jsx
git commit -m "feat: add token and planet resource/influence icons to MyPanelSection"
```

---

## Task 4: LeaderCard — icon + text type badge

**Files:**
- Modify: `src/components/game/LeaderCard.jsx`
- Create: `tests/components/game/LeaderCard.test.jsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/game/LeaderCard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaderCard from '../../../src/components/game/LeaderCard.jsx'

const AGENT = {
  id: 'l1', name: 'Rin', leader_type: 'agent',
  ability_text: 'After another player researches a technology...',
  unlock_criteria: null,
}
const COMMANDER = {
  id: 'l2', name: 'Jae Mir Kan', leader_type: 'commander',
  ability_text: 'At the end of your turn...',
  unlock_criteria: 'Have 3 or more technologies',
}
const HERO = {
  id: 'l3', name: 'The Oracle', leader_type: 'hero',
  ability_text: 'ACTION: Predict an outcome...',
  unlock_criteria: 'Have 10 or more technologies',
}
const MECH = {
  id: 'l4', name: 'Letani Warrior II', leader_type: null,
  cost: 2, combat: '8(x2)', text: 'SUSTAIN DAMAGE',
}

describe('LeaderCard', () => {
  it('renders leader name', () => {
    render(<LeaderCard leader={AGENT} status="unlocked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(screen.getByText('Rin')).toBeInTheDocument()
  })

  it('renders agent icon in type badge', () => {
    render(<LeaderCard leader={AGENT} status="unlocked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs.some(i => i.getAttribute('src') === '/icons/leaders/agent.svg')).toBeTruthy()
  })

  it('renders commander icon in type badge', () => {
    render(<LeaderCard leader={COMMANDER} status="locked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs.some(i => i.getAttribute('src') === '/icons/leaders/commander.svg')).toBeTruthy()
  })

  it('renders hero icon in type badge', () => {
    render(<LeaderCard leader={HERO} status="locked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs.some(i => i.getAttribute('src') === '/icons/leaders/hero.svg')).toBeTruthy()
  })

  it('renders type label text alongside icon', () => {
    render(<LeaderCard leader={AGENT} status="unlocked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(screen.getByText(/agent/i)).toBeInTheDocument()
  })

  it('renders status chip', () => {
    render(<LeaderCard leader={AGENT} status="unlocked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(screen.getByText('UNLOCKED')).toBeInTheDocument()
  })

  it('renders USE ABILITY button for unlocked agent', () => {
    render(<LeaderCard leader={AGENT} status="unlocked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(screen.getByRole('button', { name: /use ability/i })).toBeInTheDocument()
  })

  it('renders CHECK UNLOCK button for locked commander', () => {
    render(<LeaderCard leader={COMMANDER} status="locked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(screen.getByRole('button', { name: /check unlock/i })).toBeInTheDocument()
  })

  it('does not render type badge for mech (isMech=true)', () => {
    render(<LeaderCard leader={MECH} status="unlocked" onUseAbility={vi.fn()} onUnlock={vi.fn()} isMech={true} />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('returns null when leader is null', () => {
    const { container } = render(<LeaderCard leader={null} status="unlocked" onUseAbility={vi.fn()} onUnlock={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/game/LeaderCard.test.jsx
```

Expected: icon tests FAIL (no img rendered in badge yet)

- [ ] **Step 3: Update LeaderCard.jsx**

Add import at the top of `src/components/game/LeaderCard.jsx`:

```jsx
import GameIcon from '../shared/GameIcon.jsx'
```

Replace the `typeBadge` definition:

```jsx
// REMOVE:
const typeBadge = leader.leader_type && (
  <span className="label uppercase text-xs px-1 py-0.5 border border-border rounded">
    {leader.leader_type}
  </span>
);

// REPLACE WITH:
const typeBadge = leader.leader_type && (
  <span className="label uppercase text-xs px-1 py-0.5 border border-border rounded flex items-center gap-1">
    <GameIcon category="leaders" name={leader.leader_type} size={12} alt={leader.leader_type} />
    {leader.leader_type}
  </span>
);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/LeaderCard.test.jsx
```

Expected: All 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/game/LeaderCard.jsx tests/components/game/LeaderCard.test.jsx
git commit -m "feat: add leader type icon to LeaderCard badge"
```

---

## Task 5: HexTile — unit icons via SVG `<image>`

**Files:**
- Modify: `src/components/game/HexTile.jsx`
- Modify: `tests/components/game/HexTile.test.jsx`

The existing tests for `'4I'`, `'2I 1M'` text content will break. These must be replaced.

- [ ] **Step 1: Write the updated tests**

Open `tests/components/game/HexTile.test.jsx`. **Remove** the following four tests:
- `'renders ground-force badge with infantry count'`
- `'renders combined infantry and mech badge when pokEnabled'`
- `'omits mech from badge when pokEnabled is false'`
- `'does not render unit badge when no ground forces'`

**Add** these tests inside the `describe` block:

```jsx
it('renders space unit icon for carrier in space area', () => {
  const { container } = renderTile({
    units: [{ player_id: 'p1', unit_type: 'carrier', count: 2, on_planet: null }],
  })
  const image = container.querySelector('image[data-testid="space-unit-icon-carrier"]')
  expect(image).toBeTruthy()
  expect(image.getAttribute('href')).toBe('/icons/units/carrier.svg')
})

it('renders space unit icons for multiple unit types in space', () => {
  const { container } = renderTile({
    units: [
      { player_id: 'p1', unit_type: 'carrier', count: 2, on_planet: null },
      { player_id: 'p1', unit_type: 'fighter', count: 4, on_planet: null },
    ],
  })
  expect(container.querySelector('image[data-testid="space-unit-icon-carrier"]')).toBeTruthy()
  expect(container.querySelector('image[data-testid="space-unit-icon-fighter"]')).toBeTruthy()
})

it('does not render space unit row when no space units', () => {
  const { container } = renderTile({ units: [] })
  expect(container.querySelector('image[data-testid^="space-unit-icon"]')).toBeNull()
})

it('renders per-planet ground box with infantry icon', () => {
  const { container } = renderTile({
    units: [{ player_id: 'p1', unit_type: 'infantry', count: 3, on_planet: 'Wellon' }],
  })
  const image = container.querySelector('image[data-testid="ground-unit-icon-infantry-Wellon"]')
  expect(image).toBeTruthy()
  expect(image.getAttribute('href')).toBe('/icons/units/infantry.svg')
})

it('renders per-planet mech icon when pokEnabled', () => {
  const { container } = renderTile({
    pokEnabled: true,
    units: [{ player_id: 'p1', unit_type: 'mech', count: 1, on_planet: 'Wellon' }],
  })
  const image = container.querySelector('image[data-testid="ground-unit-icon-mech-Wellon"]')
  expect(image).toBeTruthy()
  expect(image.getAttribute('href')).toBe('/icons/units/mech.svg')
})

it('does not render mech ground icon when pokEnabled is false', () => {
  const { container } = renderTile({
    pokEnabled: false,
    units: [{ player_id: 'p1', unit_type: 'mech', count: 1, on_planet: 'Wellon' }],
  })
  expect(container.querySelector('image[data-testid="ground-unit-icon-mech-Wellon"]')).toBeNull()
})

it('renders separate ground boxes for each planet', () => {
  const { container } = renderTile({
    units: [
      { player_id: 'p1', unit_type: 'infantry', count: 2, on_planet: 'Wellon' },
      { player_id: 'p1', unit_type: 'infantry', count: 1, on_planet: 'Vefut II' },
    ],
  })
  expect(container.querySelector('image[data-testid="ground-unit-icon-infantry-Wellon"]')).toBeTruthy()
  expect(container.querySelector('image[data-testid="ground-unit-icon-infantry-Vefut II"]')).toBeTruthy()
})

it('does not render ground box when no ground forces', () => {
  const { container } = renderTile({ units: [] })
  expect(container.querySelector('image[data-testid^="ground-unit-icon"]')).toBeNull()
})

it('old text badge format is no longer rendered', () => {
  renderTile({
    units: [
      { player_id: 'p1', unit_type: 'infantry', count: 4, on_planet: 'Wellon' },
      { player_id: 'p1', unit_type: 'mech', count: 2, on_planet: 'Wellon' },
    ],
    pokEnabled: true,
  })
  expect(screen.queryByText('4I')).not.toBeInTheDocument()
  expect(screen.queryByText('2I 2M')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify new tests fail (and old badge tests are removed)**

```bash
npx vitest run tests/components/game/HexTile.test.jsx
```

Expected: new icon tests FAIL, all other existing tests still PASS

- [ ] **Step 3: Update HexTile.jsx**

Add import at the top of `src/components/game/HexTile.jsx`:

```jsx
import { SvgImageIcon } from '../shared/GameIcon.jsx'
```

**Remove** from the component function body:
```jsx
// REMOVE all of:
const infantryCount = units
  .filter(u => u.unit_type === 'infantry')
  .reduce((sum, u) => sum + (u.count ?? 0), 0)
const mechCount = pokEnabled
  ? units.filter(u => u.unit_type === 'mech').reduce((sum, u) => sum + (u.count ?? 0), 0)
  : 0

const badgeParts = []
if (infantryCount > 0) badgeParts.push(`${infantryCount}I`)
if (mechCount > 0) badgeParts.push(`${mechCount}M`)
const badgeText = badgeParts.join(' ')
const badgeWidth = Math.max(20, badgeText.length * 5.5 + 6)
```

**Add** in their place:

```jsx
// Aggregate space units by type
const spaceUnitCounts = {}
units
  .filter(u => u.on_planet === null || u.on_planet === undefined)
  .forEach(u => {
    spaceUnitCounts[u.unit_type] = (spaceUnitCounts[u.unit_type] ?? 0) + (u.count ?? 0)
  })
const spaceUnitEntries = Object.entries(spaceUnitCounts)

// Aggregate ground forces by planet
const groundByPlanet = {}
units
  .filter(u => u.on_planet !== null && u.on_planet !== undefined)
  .forEach(u => {
    if (u.unit_type !== 'infantry' && !(pokEnabled && u.unit_type === 'mech')) return
    if (!groundByPlanet[u.on_planet]) groundByPlanet[u.on_planet] = {}
    groundByPlanet[u.on_planet][u.unit_type] =
      (groundByPlanet[u.on_planet][u.unit_type] ?? 0) + (u.count ?? 0)
  })
const groundEntries = Object.entries(groundByPlanet)
```

**Remove** the old badge JSX render block:
```jsx
// REMOVE:
{badgeText && (
  <g transform={`translate(0,${size - 14})`}>
    <rect x={-badgeWidth / 2} y={-8} width={badgeWidth} height={14} rx={3} fill="#1a202c" stroke="#4a5568" strokeWidth={1} />
    <text x={0} y={2} textAnchor="middle" fontSize={9} fill="#e2e8f0" fontFamily="Space Mono,monospace">
      {badgeText}
    </text>
  </g>
)}
```

**Add** in its place (after the activations render):

```jsx
{/* Space units row */}
{spaceUnitEntries.length > 0 && (() => {
  const ENTRY_W = 26
  const totalW = spaceUnitEntries.length * ENTRY_W
  const startX = -totalW / 2
  const yRow = size * 0.30
  return (
    <g>
      <rect x={-size * 0.8} y={yRow} width={size * 1.6} height={14} rx={2} fill="#1a202c" stroke="#4a5568" strokeWidth={1} />
      {spaceUnitEntries.map(([type, count], i) => {
        const x = startX + i * ENTRY_W
        return (
          <g key={type}>
            <SvgImageIcon
              category="units"
              name={type}
              x={x}
              y={yRow + 1}
              size={12}
              data-testid={`space-unit-icon-${type}`}
            />
            <text x={x + 14} y={yRow + 10} fontSize={7} fill="#aaaaaa" fontFamily="Space Mono,monospace">
              ×{count}
            </text>
          </g>
        )
      })}
    </g>
  )
})()}

{/* Per-planet ground force boxes */}
{groundEntries.map(([planetName, counts], i) => {
  const yGround = size * 0.30 + 16 + i * 16
  return (
    <g key={planetName}>
      <rect x={-size * 0.75} y={yGround} width={size * 1.5} height={13} rx={2} fill="#1a202c" stroke="#30363d" strokeWidth={1} />
      <text x={-size * 0.73} y={yGround + 9} fontSize={7} fill="#6e7681" fontFamily="Rajdhani,sans-serif">
        {planetName}
      </text>
      {counts.infantry > 0 && (
        <g>
          <SvgImageIcon
            category="units"
            name="infantry"
            x={0}
            y={yGround + 1}
            size={10}
            data-testid={`ground-unit-icon-infantry-${planetName}`}
          />
          <text x={13} y={yGround + 9} fontSize={7} fill="#e2e8f0" fontFamily="Space Mono,monospace">
            ×{counts.infantry}
          </text>
        </g>
      )}
      {counts.mech > 0 && (
        <g>
          <SvgImageIcon
            category="units"
            name="mech"
            x={22}
            y={yGround + 1}
            size={10}
            data-testid={`ground-unit-icon-mech-${planetName}`}
          />
          <text x={35} y={yGround + 9} fontSize={7} fill="#e2e8f0" fontFamily="Space Mono,monospace">
            ×{counts.mech}
          </text>
        </g>
      )}
    </g>
  )
})}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/game/HexTile.test.jsx
```

Expected: All tests PASS

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: All tests PASS. Note the total count — it should be higher than the pre-task count since we added new tests (net positive even after removing 4 old badge tests).

- [ ] **Step 6: Update _index.md spec statuses**

In `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md`, change status for all 5 icon integration specs from `planned` → `done`:
- `component-GameIcon`
- `component-TechCard-icon-integration`
- `component-MyPanelSection-icon-integration`
- `component-LeaderCard-icon-integration`
- `component-HexTile-icon-integration`

- [ ] **Step 7: Commit**

```bash
git add src/components/game/HexTile.jsx tests/components/game/HexTile.test.jsx \
        docs/superpowers/plans/main_plan/_index.md
git commit -m "feat: add unit icons to HexTile space and ground force display"
```

---

## Final check

After all 5 tasks, run the full suite one more time to confirm nothing regressed:

```bash
cd ti4-companion-web && npx vitest run
```
