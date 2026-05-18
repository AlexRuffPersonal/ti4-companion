# LRR Rules Compliance Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `tests/rules/` directory and 16 self-contained Claude prompt files in `docs/superpowers/lrr-test-prompts/` that drive future sessions to write LRR-clause-cited Vitest tests (and, for groups 14–16, implement new shared utilities or functions first).

**Architecture:** This plan only creates documentation and prompt files — no application code is changed. Each prompt file is a standalone markdown document containing everything a future Claude session needs: which LRR sections to read, which edge functions to test, the exact test file to create, and the exemplar to follow. The `tests/rules/` directory is established with a README that describes the conventions for that directory.

**Tech Stack:** Markdown, Vitest (referenced in prompts), Supabase Edge Functions (referenced in prompts)

---

## File Map

| Action | Path |
|--------|------|
| Create | `ti4-companion-web/tests/rules/README.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/00-index.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/01-space-combat.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/02-invasion-ground-combat.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/03-status-phase-objectives.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/04-agenda-phase.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/05-turn-flow-command-tokens.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/06-movement.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/07-production-strategy-cards.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/08-technology.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/09-trade-transactions.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/10-exploration-relics.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/11-leaders-abilities.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/12-legendary-wormhole-nexus.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/13-control-elimination.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/14-adjacency.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/15-capacity.md` |
| Create | `ti4-companion-web/docs/superpowers/lrr-test-prompts/16-deals.md` |

---

## Task 1: Create tests/rules/ directory and README

**Files:**
- Create: `ti4-companion-web/tests/rules/README.md`

- [ ] **Step 1: Create the README**

Create `ti4-companion-web/tests/rules/README.md` with this content:

```markdown
# tests/rules/

Rule-compliance tests for TI4 Companion edge functions.

Each file in this directory covers a group of related LRR sections. Tests assert
that edge functions enforce the specific rule clauses they are responsible for.
Each `it()` cites the LRR clause number it covers so future rule changes are easy
to locate.

## Conventions

- One file per group (see `docs/superpowers/lrr-test-prompts/00-index.md`)
- Mock setup identical to `tests/functions/` — `vi.mock()` for `auth.ts`, `db.ts`,
  and any shared modules; import `handler` directly from the edge function
- `it()` description format: `§X.N [rule statement in plain English]`
- LRR clause comment above each `it()`: `// §X.N — <clause text>`
- Cross-function rules: import both handlers into the same file, test in sequence
  inside a single `describe` block

## Running

```bash
# From ti4-companion-web/
npm test tests/rules/                     # all rules tests
npm test tests/rules/01-space-combat.test.js  # single group
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/tests/rules/README.md
git commit -m "test(rules): add tests/rules/ directory with conventions README"
```

---

## Task 2: Create the index file

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/00-index.md`

- [ ] **Step 1: Create 00-index.md**

Create `ti4-companion-web/docs/superpowers/lrr-test-prompts/00-index.md` with this content:

```markdown
# LRR Rules Compliance Test Prompts — Index

Each prompt file is self-contained. Open it, copy the Instructions section into a
new Claude Code session, and Claude will write (and optionally implement) the tests.

**[TEST]** prompts write tests for already-built edge functions.
**[IMPLEMENT+TEST]** prompts first create a new utility or feature, then test it.

> **Ordering note:** Run 06 (Movement) before 14 (Adjacency) and 15 (Capacity).
> The group-06 tests act as a regression guard for `game-move-ships` during the
> extraction refactors in groups 14 and 15.

## Progress

| # | Type | Group | Output Test File | Done? |
|---|------|-------|-----------------|-------|
| 01 | TEST | Space Combat | `tests/rules/01-space-combat.test.js` | [ ] |
| 02 | TEST | Invasion & Ground Combat | `tests/rules/02-invasion-ground-combat.test.js` | [ ] |
| 03 | TEST | Status Phase & Objectives | `tests/rules/03-status-phase-objectives.test.js` | [ ] |
| 04 | TEST | Agenda Phase | `tests/rules/04-agenda-phase.test.js` | [ ] |
| 05 | TEST | Turn Flow & Command Tokens | `tests/rules/05-turn-flow-command-tokens.test.js` | [ ] |
| 06 | TEST | Movement | `tests/rules/06-movement.test.js` | [ ] |
| 07 | TEST | Production & Strategy Cards | `tests/rules/07-production-strategy-cards.test.js` | [ ] |
| 08 | TEST | Technology | `tests/rules/08-technology.test.js` | [ ] |
| 09 | TEST | Trade & Transactions | `tests/rules/09-trade-transactions.test.js` | [ ] |
| 10 | TEST | Exploration & Relics | `tests/rules/10-exploration-relics.test.js` | [ ] |
| 11 | TEST | Leaders & Abilities | `tests/rules/11-leaders-abilities.test.js` | [ ] |
| 12 | TEST | Legendary Planets & Wormhole Nexus | `tests/rules/12-legendary-wormhole-nexus.test.js` | [ ] |
| 13 | TEST | Control & Elimination | `tests/rules/13-control-elimination.test.js` | [ ] |
| 14 | IMPLEMENT+TEST | Adjacency | `tests/rules/14-adjacency.test.js` | [ ] |
| 15 | IMPLEMENT+TEST | Capacity | `tests/rules/15-capacity.test.js` | [ ] |
| 16 | IMPLEMENT+TEST | Deals | `tests/rules/16-deals.test.js` | [ ] |

## How to run a prompt

1. Open the numbered `.md` file in this directory
2. Start a new Claude Code session
3. Paste the full contents of the file as your opening message
4. Claude will read the LRR, write the tests, run them, and commit
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/00-index.md
git commit -m "docs(lrr-tests): add prompt index file"
```

---

## Task 3: Prompt 01 — Space Combat

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/01-space-combat.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Space Combat
**Type:** TEST

## LRR Sections Covered
- §10 Anti-Fighter Barrage
- §74 Rerolls
- §77 Space Cannon (Offense)
- §78 Space Combat

## Edge Functions Under Test
- `game-fire-anti-fighter-barrage` — AFB dice rolls and hit assignment to fighters only
- `game-advance-barrage` — phase transition after barrage resolution
- `game-fire-space-cannon` — space cannon offense rolls before combat
- `game-roll-combat-dice` — combat dice rolls per combat round
- `game-assign-hits` — hit assignment including sustain damage ordering
- `game-declare-retreat` — retreat legality and destination validation

## Output
Write tests to: `tests/rules/01-space-combat.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md` — conventions for `tests/rules/` files
2. `ti4-companion-web/docs/ti4-lrr.md` §10, §74, §77, §78 — read every numbered clause; note which clauses are enforced by the edge functions listed above
3. `ti4-companion-web/tests/functions/game-fire-anti-fighter-barrage.test.js` — AFB mock setup pattern
4. `ti4-companion-web/tests/functions/game-assign-hits.test.js` — hits mock setup pattern
5. `ti4-companion-web/tests/functions/game-roll-combat-dice.phase30.test.js` — combat dice mock setup pattern

**Goal:** Create `tests/rules/01-space-combat.test.js`.

For each clause in §10, §74, §77, §78 that is actively enforced by an edge function:
- Write one `it()` with the clause number in the description: `it('§78.5 attacker rolls first in each combat round', ...)`
- Add a comment above the `it()`: `// §78.5 — <exact or paraphrased clause text>`
- Use the same `vi.mock()` / `handler` import / `makeRequest` / `mockDb` pattern as the exemplars above
- Where a clause is NOT enforced (honour-system or UI-only), add `it.todo('§X.N — <clause> (not enforced)')` instead

**Test file structure:**
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
// vi.mock calls for auth.ts, db.ts, shared modules used by any handler in this file
// handler imports
// ID constants
// makeRequest helpers (one per handler)
// base fixture objects

describe('Space Combat — LRR §10 §74 §77 §78', () => {
  describe('§10 Anti-Fighter Barrage', () => {
    // §10.1 — ...
    it('§10.1 AFB hits apply only to fighters; excess hits are discarded', async () => { ... })
    // etc.
  })
  describe('§77 Space Cannon', () => { ... })
  describe('§78 Space Combat', () => { ... })
})
```

**After writing:** Run `npm test tests/rules/01-space-combat.test.js` from `ti4-companion-web/`. Fix any failures. Then commit:
```bash
git add tests/rules/01-space-combat.test.js
git commit -m "test(rules): add §10 §74 §77 §78 space combat compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/01-space-combat.md
git commit -m "docs(lrr-tests): add prompt 01 space combat"
```

---

## Task 4: Prompt 02 — Invasion & Ground Combat

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/02-invasion-ground-combat.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Invasion & Ground Combat
**Type:** TEST

## LRR Sections Covered
- §42 Ground Combat
- §43 Ground Forces
- §49 Invasion
- §55 Mechs

## Edge Functions Under Test
- `game-fire-bombardment` — bombardment dice rolls before ground combat
- `game-advance-bombardment` — phase transition after bombardment
- `game-fire-space-cannon-defense` — PDS space cannon defence during invasion
- `game-commit-ground-forces` — landing troops and initiating ground combat; mech deployment
- `game-roll-ground-combat-dice` — ground combat dice rolls

## Output
Write tests to: `tests/rules/02-invasion-ground-combat.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §42, §43, §49, §55 — every numbered clause
3. `ti4-companion-web/tests/functions/game-commit-ground-forces.test.js` — mock setup pattern
4. `ti4-companion-web/tests/functions/game-fire-bombardment.test.js` — bombardment pattern
5. `ti4-companion-web/tests/functions/game-roll-ground-combat-dice.test.js`

**Goal:** Create `tests/rules/02-invasion-ground-combat.test.js`.

For each clause in §42, §43, §49, §55 enforced by the listed functions, write one `it()` citing the clause. Use `it.todo()` for unenforced clauses.

**Test file structure:**
```js
describe('Invasion & Ground Combat — LRR §42 §43 §49 §55', () => {
  describe('§42 Ground Combat', () => { ... })
  describe('§43 Ground Forces', () => { ... })
  describe('§49 Invasion', () => { ... })
  describe('§55 Mechs', () => { ... })
})
```

Note: §49 Invasion spans multiple functions (bombardment → space cannon defence → commit ground forces). Import all relevant handlers and test the sequence within the §49 `describe` block.

**After writing:** Run `npm test tests/rules/02-invasion-ground-combat.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/02-invasion-ground-combat.test.js
git commit -m "test(rules): add §42 §43 §49 §55 invasion & ground combat compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/02-invasion-ground-combat.md
git commit -m "docs(lrr-tests): add prompt 02 invasion & ground combat"
```

---

## Task 5: Prompt 03 — Status Phase & Objectives

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/03-status-phase-objectives.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Status Phase & Objectives
**Type:** TEST

## LRR Sections Covered
- §61 Objective Cards
- §81 Status Phase
- §87 Victory Points

## Edge Functions Under Test
- `game-reveal-objective` — revealing stage I/II objectives in the correct order and count
- `game-score-objective` — scoring public objectives; VP cap enforcement
- `game-score-secret-objective` — scoring secret objectives; once-per-game limit
- `game-advance-phase` — status phase step sequencing; ready cards, return command tokens, repair units, gain command tokens, qualify objectives, reveal objectives

## Output
Write tests to: `tests/rules/03-status-phase-objectives.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §61, §81, §87 — every numbered clause
3. `ti4-companion-web/tests/functions/game-score-secret-objective.test.js` — mock setup pattern
4. `ti4-companion-web/tests/functions/game-status-phase.test.js`
5. `ti4-companion-web/tests/functions/game-advance-phase.test.js`

**Goal:** Create `tests/rules/03-status-phase-objectives.test.js`.

For each clause enforced, write one `it()` citing the clause. Use `it.todo()` for unenforced. Pay special attention to: VP win condition check (§87), once-per-round scoring limit per objective (§61), and the ordered steps of the status phase (§81).

**After writing:** Run `npm test tests/rules/03-status-phase-objectives.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/03-status-phase-objectives.test.js
git commit -m "test(rules): add §61 §81 §87 status phase & objectives compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/03-status-phase-objectives.md
git commit -m "docs(lrr-tests): add prompt 03 status phase & objectives"
```

---

## Task 6: Prompt 04 — Agenda Phase

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/04-agenda-phase.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Agenda Phase
**Type:** TEST

## LRR Sections Covered
- §8 Agenda Phase

## Edge Functions Under Test
- `game-draw-agenda` — drawing two agendas; speaker draws first
- `game-cast-votes` — vote casting; influence spending; abstain legality; Xxcha faction bonus
- `game-resolve-agenda` — outcome determination (most votes wins; tie → speaker decides); effect application via ability DSL

## Output
Write tests to: `tests/rules/04-agenda-phase.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §8 — every numbered clause
3. `ti4-companion-web/tests/functions/game-draw-agenda.test.js`
4. `ti4-companion-web/tests/functions/game-cast-votes.test.js`
5. `ti4-companion-web/tests/functions/game-resolve-agenda.test.js`

**Goal:** Create `tests/rules/04-agenda-phase.test.js`.

Key clauses to cover: vote eligibility (planets must be ready), max votes per player (total planet influence), tie-breaking (speaker picks), agenda type handling (directive vs. law), when laws persist vs. resolve immediately. Use `it.todo()` for law persistence effects not yet implemented in `game-resolve-agenda`.

**After writing:** Run `npm test tests/rules/04-agenda-phase.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/04-agenda-phase.test.js
git commit -m "test(rules): add §8 agenda phase compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/04-agenda-phase.md
git commit -m "docs(lrr-tests): add prompt 04 agenda phase"
```

---

## Task 7: Prompt 05 — Turn Flow & Command Tokens

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/05-turn-flow-command-tokens.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Turn Flow & Command Tokens
**Type:** TEST

## LRR Sections Covered
- §3 Action Phase
- §20 Command Tokens
- §37 Fleet Pool

## Edge Functions Under Test
- `game-activate-system` — tactic token placement; system cannot be activated twice in a round by same player; fleet pool cap
- `game-end-turn` — turn end; strategy card exhausted after use
- `game-player-pass` — pass legality (must have played strategy card)
- `game-update-command-tokens` — command token redistribution; total 16 cap

## Output
Write tests to: `tests/rules/05-turn-flow-command-tokens.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §3, §20, §37 — every numbered clause
3. `ti4-companion-web/tests/functions/game-activate-system.test.js`
4. `ti4-companion-web/tests/functions/game-end-turn.test.js`
5. `ti4-companion-web/tests/functions/game-update-command-tokens.phase6.test.js`

**Goal:** Create `tests/rules/05-turn-flow-command-tokens.test.js`.

Key clauses: a system already activated this round cannot be activated again (§3); tactic tokens are spent from the tactic pool (§20); fleet pool cap limits ships in a system (§37); total command tokens across all pools cannot exceed 16 (§20).

**After writing:** Run `npm test tests/rules/05-turn-flow-command-tokens.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/05-turn-flow-command-tokens.test.js
git commit -m "test(rules): add §3 §20 §37 turn flow & command token compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/05-turn-flow-command-tokens.md
git commit -m "docs(lrr-tests): add prompt 05 turn flow & command tokens"
```

---

## Task 8: Prompt 06 — Movement

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/06-movement.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Movement
**Type:** TEST

## LRR Sections Covered
- §41 Gravity Rift
- §58 Movement

## Edge Functions Under Test
- `game-move-ships` — move value enforcement; gravity rift roll trigger; ships cannot move through systems they don't control (blockades)
- `game-roll-rift-dice` — gravity rift die roll; on a 1–3 the ship is destroyed

## Output
Write tests to: `tests/rules/06-movement.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §41, §58 — every numbered clause
3. `ti4-companion-web/tests/functions/game-roll-rift-dice.test.js`
4. `ti4-companion-web/tests/hooks/useMovement.test.js`

**Goal:** Create `tests/rules/06-movement.test.js`.

Key clauses: ships cannot exceed their move value (§58); a ship must pass through a gravity rift when moving through it (§41); on a rift roll of 1–3 the ship is destroyed (§41); ships cannot move through a system containing enemy ships without winning combat first (§58, blockade). Use `it.todo()` for movement rules that are honour-system only (e.g. path-tracing adjacency, which is validated in group 14).

**After writing:** Run `npm test tests/rules/06-movement.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/06-movement.test.js
git commit -m "test(rules): add §41 §58 movement compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/06-movement.md
git commit -m "docs(lrr-tests): add prompt 06 movement"
```

---

## Task 9: Prompt 07 — Production & Strategy Cards

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/07-production-strategy-cards.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Production & Strategy Cards
**Type:** TEST

## LRR Sections Covered
- §67 Producing Units
- §68 Production (unit ability)
- Strategy Cards (§3 references; card text in CLAUDE.md §12)

## Edge Functions Under Test
- `game-produce-units` — resource cost enforcement; production limit (2 + space dock capacity); fleet pool cap
- `game-play-strategy-card` — strategy card played by active player; card exhausted after use
- `game-use-strategy-secondary` — secondary ability used by non-active players; command token cost
- `game-pass-strategy-secondary` — pass on secondary; no token spent

## Output
Write tests to: `tests/rules/07-production-strategy-cards.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §67, §68 — every numbered clause
3. `ti4-companion-web/tests/functions/game-produce-units.test.js`
4. `ti4-companion-web/tests/functions/game-play-strategy-card.test.js`
5. `ti4-companion-web/tests/functions/game-use-strategy-secondary.test.js`

**Goal:** Create `tests/rules/07-production-strategy-cards.test.js`.

Key clauses: units cost resources equal to their cost (§67); production limit = 2 + space dock capacity (§68); fleet pool cannot exceed fleet pool value after production (§37 via §68); strategy card secondary costs a command token from strategy pool (Strategy Cards rules).

**After writing:** Run `npm test tests/rules/07-production-strategy-cards.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/07-production-strategy-cards.test.js
git commit -m "test(rules): add §67 §68 production & strategy card compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/07-production-strategy-cards.md
git commit -m "docs(lrr-tests): add prompt 07 production & strategy cards"
```

---

## Task 10: Prompt 08 — Technology

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/08-technology.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Technology
**Type:** TEST

## LRR Sections Covered
- §34 Exhausted / Readied
- §97 Unit Upgrades
- Technology Research (Strategy Card primary)

## Edge Functions Under Test
- `game-research-technology` — prerequisite enforcement; cannot research a tech already owned
- `game-exhaust-technology` — mark technology exhausted; cannot use an exhausted technology
- `game-ready-technology` — ready exhausted technology (status phase)
- `game-use-technology-action` — action-type technology activation

## Output
Write tests to: `tests/rules/08-technology.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §34, §97 — every numbered clause
3. `ti4-companion-web/tests/functions/game-research-technology.test.js`
4. `ti4-companion-web/tests/functions/game-exhaust-technology.test.js`
5. `ti4-companion-web/tests/functions/game-research-technology.phase30.test.js`

**Goal:** Create `tests/rules/08-technology.test.js`.

Key clauses: cannot research a technology already owned (§97); prerequisite colour counts must be met (§97); exhausted technologies cannot be used until readied (§34); unit upgrade replaces base unit stats (§97).

**After writing:** Run `npm test tests/rules/08-technology.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/08-technology.test.js
git commit -m "test(rules): add §34 §97 technology compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/08-technology.md
git commit -m "docs(lrr-tests): add prompt 08 technology"
```

---

## Task 11: Prompt 09 — Trade & Transactions

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/09-trade-transactions.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Trade & Transactions
**Type:** TEST

## LRR Sections Covered
- §21 Commodities
- §92 Trade (Strategy Card)
- §94 Transactions

## Edge Functions Under Test
- `game-create-transaction` — transaction legality; players must be neighbours; components are valid transaction items
- `game-confirm-transaction` — components transfer on confirmation; commodities convert to trade goods for recipient
- `game-reject-transaction` — transaction cancelled; no components change hands
- `game-rescind-transaction` — proposer cancels before confirmation
- `game-play-promissory-note` — promissory note played to target; routed via ability DSL

## Output
Write tests to: `tests/rules/09-trade-transactions.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §21, §92, §94 — every numbered clause
3. `ti4-companion-web/tests/functions/game-create-transaction.test.js`
4. `ti4-companion-web/tests/functions/game-confirm-transaction.test.js`
5. `ti4-companion-web/tests/functions/game-play-promissory-note.test.js`

**Goal:** Create `tests/rules/09-trade-transactions.test.js`.

Key clauses: transactions only between neighbours (§94); at most one transaction per player per round (§94); commodities received become trade goods (§21); only specific items can be included in transactions (§94). Use `it.todo()` for deal enforcement (covered in group 16).

**After writing:** Run `npm test tests/rules/09-trade-transactions.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/09-trade-transactions.test.js
git commit -m "test(rules): add §21 §92 §94 trade & transaction compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/09-trade-transactions.md
git commit -m "docs(lrr-tests): add prompt 09 trade & transactions"
```

---

## Task 12: Prompt 10 — Exploration & Relics

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/10-exploration-relics.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Exploration & Relics
**Type:** TEST

## LRR Sections Covered
- §35 Exploration
- §38 Frontier Tokens
- §73 Relics

## Edge Functions Under Test
- `game-explore-planet` — draw from correct deck based on planet trait; attach if attachment card
- `game-explore-frontier` — draw from frontier deck; triggered by moving into empty system
- `game-resolve-exploration-card` — apply card effect via `shared-explorationEffects`
- `game-use-relic-fragment` — combine three matching fragments into a relic
- `game-use-relic` — apply relic effect via `shared-relicEffects`

## Output
Write tests to: `tests/rules/10-exploration-relics.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §35, §38, §73 — every numbered clause
3. `ti4-companion-web/tests/functions/game-explore-planet.test.js`
4. `ti4-companion-web/tests/functions/game-explore-frontier.test.js`
5. `ti4-companion-web/tests/functions/game-use-relic.test.js`

**Goal:** Create `tests/rules/10-exploration-relics.test.js`.

Key clauses: planet trait determines exploration deck (§35); a planet can only be explored once per round (§35); frontier tokens are removed after exploration (§38); three matching fragments combine into one relic (§73); an exhausted relic cannot be used until readied (§73).

**After writing:** Run `npm test tests/rules/10-exploration-relics.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/10-exploration-relics.test.js
git commit -m "test(rules): add §35 §38 §73 exploration & relic compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/10-exploration-relics.md
git commit -m "docs(lrr-tests): add prompt 10 exploration & relics"
```

---

## Task 13: Prompt 11 — Leaders & Abilities

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/11-leaders-abilities.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Leaders & Abilities
**Type:** TEST

## LRR Sections Covered
- §1 Abilities
- §30 Deploy
- §51 Leaders
- §70 Purge

## Edge Functions Under Test
- `game-resolve-ability` — ability DSL execution; exhausted abilities cannot be reused until readied
- `game-unlock-hero` — hero unlock condition (commander must be unlocked first)
- `game-unlock-commander` — commander unlock condition (faction-specific scored objectives)

## Output
Write tests to: `tests/rules/11-leaders-abilities.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §1, §30, §51, §70 — every numbered clause
3. `ti4-companion-web/tests/functions/game-resolve-ability.test.js`
4. `ti4-companion-web/tests/functions/game-unlock-hero.test.js`
5. `ti4-companion-web/tests/functions/game-unlock-commander.test.js`

**Goal:** Create `tests/rules/11-leaders-abilities.test.js`.

Key clauses: an exhausted ability cannot be triggered again until readied (§1); hero requires commander to be unlocked first (§51); purged leaders/cards are removed from the game permanently (§70); deploy abilities place units without a tactical action (§30). Use `it.todo()` for specific faction ability effects not yet implemented in the DSL.

**After writing:** Run `npm test tests/rules/11-leaders-abilities.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/11-leaders-abilities.test.js
git commit -m "test(rules): add §1 §30 §51 §70 leaders & abilities compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/11-leaders-abilities.md
git commit -m "docs(lrr-tests): add prompt 11 leaders & abilities"
```

---

## Task 14: Prompt 12 — Legendary Planets & Wormhole Nexus

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/12-legendary-wormhole-nexus.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Legendary Planets & Wormhole Nexus
**Type:** TEST

## LRR Sections Covered
- §53 Legendary Planets
- §100 Wormhole Nexus

## Edge Functions Under Test
- `game-resolve-ability` — legendary planet ability activation; exhausted after use; readied at status phase
- `game-commit-ground-forces` — control of legendary planet grants ability card
- `game-move-ships` — wormhole nexus treated as adjacent to all systems with matching wormhole type

## Output
Write tests to: `tests/rules/12-legendary-wormhole-nexus.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §53, §100 — every numbered clause
3. `ti4-companion-web/tests/functions/game-resolve-ability.phase30.test.js`
4. `ti4-companion-web/tests/functions/game-commit-ground-forces.test.js`
5. `ti4-companion-web/tests/hooks/useLegendaryCards.test.js`

**Goal:** Create `tests/rules/12-legendary-wormhole-nexus.test.js`.

Key clauses: legendary planet ability is exhausted on use and readied at status phase (§53); controlling player gains the legendary ability card when they take control (§53); wormhole nexus is adjacent to all alpha/beta wormhole systems (§100); nexus flips to show both wormhole types after the first player moves through it (§100).

**After writing:** Run `npm test tests/rules/12-legendary-wormhole-nexus.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/12-legendary-wormhole-nexus.test.js
git commit -m "test(rules): add §53 §100 legendary planets & wormhole nexus compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/12-legendary-wormhole-nexus.md
git commit -m "docs(lrr-tests): add prompt 12 legendary planets & wormhole nexus"
```

---

## Task 15: Prompt 13 — Control & Elimination

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/13-control-elimination.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Control & Elimination
**Type:** TEST

## LRR Sections Covered
- §25 Control
- §33 Elimination

## Edge Functions Under Test
- `game-land-troops` — control token placed when last enemy ground force destroyed; controller gains planet card
- `game-assign-hits` — control transfer when attacker wins space combat and system has no defenders

## Output
Write tests to: `tests/rules/13-control-elimination.test.js`

## Instructions

You are writing LRR rule-compliance Vitest tests for TI4 Companion.

**Before writing any code, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §25, §33 — every numbered clause
3. `ti4-companion-web/tests/functions/game-land-troops.test.js`
4. `ti4-companion-web/tests/functions/game-assign-hits.test.js`

**Goal:** Create `tests/rules/13-control-elimination.test.js`.

Key clauses: a player controls a planet when they have a control token on it and no enemy ground forces remain (§25); an eliminated player's control tokens are removed from all planets (§33); an eliminated player's ships are removed from all systems (§33); an eliminated player can no longer take turns (§33).

**After writing:** Run `npm test tests/rules/13-control-elimination.test.js` from `ti4-companion-web/`. Fix failures. Commit:
```bash
git add tests/rules/13-control-elimination.test.js
git commit -m "test(rules): add §25 §33 control & elimination compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/13-control-elimination.md
git commit -m "docs(lrr-tests): add prompt 13 control & elimination"
```

---

## Task 16: Prompt 14 — Adjacency (IMPLEMENT+TEST)

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/14-adjacency.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Adjacency
**Type:** IMPLEMENT+TEST

## LRR Sections Covered
- §6 Adjacency
- §101 Wormholes

## New Code Required
- Extract adjacency logic from `supabase/functions/game-move-ships/index.ts` into
  `supabase/functions/_shared/adjacency.ts` exporting `isAdjacent(systemA, systemB, context)`
- Update `game-move-ships` to call `isAdjacent` from the shared utility
- The existing `tests/rules/06-movement.test.js` must still pass after the extraction

## Output
- New file: `supabase/functions/_shared/adjacency.ts`
- Modified file: `supabase/functions/game-move-ships/index.ts`
- New test file: `tests/rules/14-adjacency.test.js`

## Instructions

You are implementing a shared adjacency utility and writing its LRR rule-compliance tests for TI4 Companion.

> **This is an IMPLEMENT+TEST task.** Use the `superpowers:writing-plans` skill to create an implementation plan before writing any code.

**Before planning, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md` — test conventions
2. `ti4-companion-web/docs/ti4-lrr.md` §6, §101 — every numbered clause
3. `supabase/functions/game-move-ships/index.ts` — locate existing adjacency checks to extract
4. `ti4-companion-web/tests/rules/06-movement.test.js` — regression suite that must stay green

**What to implement:**

`supabase/functions/_shared/adjacency.ts` must export:
```ts
export function isAdjacent(
  systemKeyA: string,         // "q,r" axial coord
  systemKeyB: string,
  context: {
    mapTiles: Record<string, { wormhole?: string; hyperlane?: boolean }>,
    activeWormholes: string[], // wormhole types currently active (e.g. ['alpha', 'beta'])
  }
): boolean
```

Rules to implement (read the full clauses in the LRR):
- §6.1 Normal adjacency: two systems sharing a border
- §6.2 Wormhole adjacency: systems with the same wormhole type are adjacent (§101)
- §6.3 Hyperlane adjacency: systems connected via a hyperlane tile

**After extraction:** Run `npm test tests/rules/06-movement.test.js` to confirm no regressions. Then write `tests/rules/14-adjacency.test.js` testing `isAdjacent` directly (unit test — no handler import needed). Run `npm test tests/rules/14-adjacency.test.js`. Fix failures. Commit:
```bash
git add supabase/functions/_shared/adjacency.ts
git add supabase/functions/game-move-ships/index.ts
git add tests/rules/14-adjacency.test.js
git commit -m "feat: extract adjacency utility; test(rules): add §6 §101 adjacency compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/14-adjacency.md
git commit -m "docs(lrr-tests): add prompt 14 adjacency (implement+test)"
```

---

## Task 17: Prompt 15 — Capacity (IMPLEMENT+TEST)

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/15-capacity.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Capacity
**Type:** IMPLEMENT+TEST

## LRR Sections Covered
- §16 Capacity
- §16 Transport (sub-section)

## New Code Required
- Extract capacity logic from `supabase/functions/game-move-ships/index.ts` into
  `supabase/functions/_shared/capacity.ts`
- Update `game-move-ships` to call the shared utility
- The existing `tests/rules/06-movement.test.js` must still pass after extraction

## Output
- New file: `supabase/functions/_shared/capacity.ts`
- Modified file: `supabase/functions/game-move-ships/index.ts`
- New test file: `tests/rules/15-capacity.test.js`

## Instructions

You are implementing a shared capacity utility and writing its LRR rule-compliance tests for TI4 Companion.

> **This is an IMPLEMENT+TEST task.** Use the `superpowers:writing-plans` skill to create an implementation plan before writing any code.

**Before planning, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §16 — every numbered clause
3. `supabase/functions/game-move-ships/index.ts` — locate existing capacity checks
4. `ti4-companion-web/tests/rules/06-movement.test.js` — regression suite that must stay green

**What to implement:**

`supabase/functions/_shared/capacity.ts` must export:
```ts
export function computeCapacity(units: { unit_type: string; count: number }[]): number
// returns total transport capacity from carriers and flagships

export function computeTransportedUnits(units: { unit_type: string; count: number }[]): number
// returns count of units that require transport (fighters + infantry)

export function capacityViolation(units: { unit_type: string; count: number }[]): string | null
// returns an error message if transported units exceed capacity, null otherwise
```

Rules to implement (read the full clauses in the LRR):
- §16.1 Fighters and infantry require transport capacity to move
- §16.2 Each carrier/flagship provides capacity equal to its capacity stat
- §16.3 Units cannot move if transported units exceed available capacity

**After extraction:** Run `npm test tests/rules/06-movement.test.js`. Then write `tests/rules/15-capacity.test.js` testing the utility functions directly. Run `npm test tests/rules/15-capacity.test.js`. Fix failures. Commit:
```bash
git add supabase/functions/_shared/capacity.ts
git add supabase/functions/game-move-ships/index.ts
git add tests/rules/15-capacity.test.js
git commit -m "feat: extract capacity utility; test(rules): add §16 capacity compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/15-capacity.md
git commit -m "docs(lrr-tests): add prompt 15 capacity (implement+test)"
```

---

## Task 18: Prompt 16 — Deals (IMPLEMENT+TEST)

**Files:**
- Create: `ti4-companion-web/docs/superpowers/lrr-test-prompts/16-deals.md`

- [ ] **Step 1: Create the prompt file**

```markdown
# LRR Test Prompt: Deals
**Type:** IMPLEMENT+TEST

## LRR Sections Covered
- §28 Deals

## New Code Required
- New migration: `supabase/migrations/NNN_deals.sql` — `game_deals` table
- New edge functions: `game-propose-deal`, `game-confirm-deal`, `game-renege-deal`
- New test file: `tests/rules/16-deals.test.js`

## Output
- New migration: `supabase/migrations/NNN_deals.sql`
- New functions: `supabase/functions/game-propose-deal/index.ts`, `game-confirm-deal/index.ts`, `game-renege-deal/index.ts`
- New test file: `tests/rules/16-deals.test.js`

## Instructions

You are implementing deal-tracking functions and writing their LRR rule-compliance tests for TI4 Companion.

> **This is an IMPLEMENT+TEST task.** Use the `superpowers:writing-plans` skill to create an implementation plan before writing any code. This task also requires updating `main_plan/_index.md` with spec entries for the new functions.

**Before planning, read these files in full:**
1. `ti4-companion-web/docs/superpowers/specs/2026-05-18-lrr-rules-compliance-test-suite-design.md`
2. `ti4-companion-web/docs/ti4-lrr.md` §28 — every numbered clause
3. `ti4-companion-web/docs/superpowers/plans/main_plan/_standards.md` — shorthand tokens for spec files
4. `ti4-companion-web/docs/superpowers/plans/main_plan/_index.md` — where to add new spec rows
5. `supabase/functions/game-create-transaction/index.ts` — follow this pattern for the new functions
6. `supabase/migrations/` — run `ls supabase/migrations/ | tail -5` to identify the next migration number and use it in place of `NNN` throughout

**What to implement:**

`game_deals` table columns: `id uuid PK`, `game_id uuid FK`, `proposer_id uuid FK game_players`, `recipient_id uuid FK game_players`, `components jsonb` (what's being offered/requested), `status text CHECK IN ('proposed','confirmed','reneged')`, `round int`, `created_at timestamptz`.

Rules to enforce (read the full clauses in the LRR):
- §28.1 Deals can be proposed between any two players at any time (no neighbour restriction)
- §28.2 Only specific items can be part of a deal (trade goods, action cards, promissory notes, relics)
- §28.3 Deals are binding on the honour system — the app records deals but cannot force fulfilment; `game-renege-deal` records a renege publicly
- Read §28 in full — note any clause about limits on the number of deals per round or per player pair

**After implementation:** Write `tests/rules/16-deals.test.js` with one `it()` per enforced §28 clause. Run `npm test tests/rules/16-deals.test.js`. Fix failures. Commit:
```bash
git add supabase/migrations/NNN_deals.sql
git add supabase/functions/game-propose-deal/index.ts
git add supabase/functions/game-confirm-deal/index.ts
git add supabase/functions/game-renege-deal/index.ts
git add tests/rules/16-deals.test.js
git commit -m "feat: add deals feature; test(rules): add §28 deals compliance tests"
```
```

- [ ] **Step 2: Commit**

```bash
git add ti4-companion-web/docs/superpowers/lrr-test-prompts/16-deals.md
git commit -m "docs(lrr-tests): add prompt 16 deals (implement+test)"
```

---

## Task 19: Final batch commit check

- [ ] **Step 1: Verify all files exist**

```bash
ls ti4-companion-web/docs/superpowers/lrr-test-prompts/
ls ti4-companion-web/tests/rules/
```

Expected output for `lrr-test-prompts/`:
```
00-index.md  01-space-combat.md  02-invasion-ground-combat.md
03-status-phase-objectives.md  04-agenda-phase.md
05-turn-flow-command-tokens.md  06-movement.md
07-production-strategy-cards.md  08-technology.md
09-trade-transactions.md  10-exploration-relics.md
11-leaders-abilities.md  12-legendary-wormhole-nexus.md
13-control-elimination.md  14-adjacency.md  15-capacity.md  16-deals.md
```

Expected output for `tests/rules/`:
```
README.md
```

- [ ] **Step 2: Verify git log**

```bash
git log --oneline -20
```

You should see one commit per task above. If any prompt file is missing, create it now using the content from the relevant task.

- [ ] **Step 3: Run the full test suite to confirm no regressions**

```bash
cd ti4-companion-web && npm test
```

Expected: all previously passing tests still pass. No new failures (we haven't added test files yet, only prompt and documentation files).
