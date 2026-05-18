# LRR Rules Compliance Test Suite — Design

**Date:** 2026-05-18

## Goal

Create a structured set of Claude prompt files, each covering a group of related TI4 Living Rules Reference sections. Each prompt is self-contained and produces either:

- **[TEST]** — Vitest tests asserting rule-correct behaviour against already-built edge functions, or
- **[IMPLEMENT+TEST]** — a new shared utility or edge function (plus any required changes to existing functions), followed by its full test coverage.

A failing test in `tests/rules/` means a rules violation. Each `it()` cites the LRR clause it covers so future rules changes are easy to locate.

---

## Folder Structure

### Prompt files

```
ti4-companion-web/docs/superpowers/lrr-test-prompts/
  00-index.md                          ← master index with completion checkboxes
  01-space-combat.md                   [TEST]
  02-invasion-ground-combat.md         [TEST]
  03-status-phase-objectives.md        [TEST]
  04-agenda-phase.md                   [TEST]
  05-turn-flow-command-tokens.md       [TEST]
  06-movement-capacity.md              [TEST]
  07-production-strategy-cards.md      [TEST]
  08-technology.md                     [TEST]
  09-trade-transactions.md             [TEST]
  10-exploration-relics.md             [TEST]
  11-leaders-abilities.md              [TEST]
  12-legendary-wormhole-nexus.md       [TEST]
  13-control-elimination.md            [TEST]
  14-adjacency.md                      [IMPLEMENT+TEST]
  15-capacity.md                       [IMPLEMENT+TEST]
  16-deals.md                          [IMPLEMENT+TEST]
```

### Test output files

```
ti4-companion-web/tests/rules/
  01-space-combat.test.js
  02-invasion-ground-combat.test.js
  03-status-phase-objectives.test.js
  04-agenda-phase.test.js
  05-turn-flow-command-tokens.test.js
  06-movement-capacity.test.js
  07-production-strategy-cards.test.js
  08-technology.test.js
  09-trade-transactions.test.js
  10-exploration-relics.test.js
  11-leaders-abilities.test.js
  12-legendary-wormhole-nexus.test.js
  13-control-elimination.test.js
  14-adjacency.test.js
  15-capacity.test.js
  16-deals.test.js
```

---

## Prompt File Format

Each prompt file is a self-contained markdown document following this template:

```markdown
# LRR Test Prompt: [Group Name]
**Type:** [TEST] | [IMPLEMENT+TEST]

## LRR Sections Covered
- §X Topic — clause X.1 (description), X.2, ...

## Edge Functions Under Test
- `function-name` — what rule it enforces

## New Code Required  ← [IMPLEMENT+TEST] prompts only
- What to create/modify and why

## Output
Write tests to: `tests/rules/[group-slug].test.js`

## Instructions
[Full self-contained Claude prompt]
```

---

## Test File Conventions

**Location:** `tests/rules/` — sibling to `tests/functions/` and `tests/hooks/`.

**Technical setup** (identical to `tests/functions/`):
- `vi.mock()` for `auth.ts`, `db.ts`, and relevant shared modules
- Import `handler` directly from edge function
- `makeRequest()` helper per function
- Base fixture objects at top of file

**Rule-centric framing:** Each `it()` names the LRR clause it covers:

```js
// §78.6 — sustain-damage unit absorbs a hit before other units are destroyed
it('§78.6 sustain-damage unit absorbs hit before non-sustain units', async () => { ... })

// §10.1 — AFB hits apply only to fighters; excess hits are discarded
it('§10.1 AFB hits do not carry over to non-fighter units', async () => { ... })
```

**Cross-function rules:** Where one rule clause spans multiple functions, both handlers are imported into the same test file and exercised in sequence within a single `describe` block.

---

## The 16 Groups

Ordered by risk — highest-risk areas (combat, scoring) first.

### [TEST] Groups (1–13)

| # | Group | LRR Sections | Edge Functions Under Test |
|---|-------|-------------|--------------------------|
| 01 | Space Combat | §10 AFB, §74 Rerolls, §77 Space Cannon, §78 Space Combat | `game-fire-anti-fighter-barrage`, `game-advance-barrage`, `game-fire-space-cannon`, `game-roll-combat-dice`, `game-assign-hits`, `game-declare-retreat` |
| 02 | Invasion & Ground Combat | §42 Ground Combat, §43 Ground Forces, §49 Invasion, §55 Mechs | `game-fire-bombardment`, `game-advance-bombardment`, `game-commit-ground-forces`, `game-fire-space-cannon-defense`, `game-roll-ground-combat-dice` |
| 03 | Status Phase & Objectives | §61 Objective Cards, §81 Status Phase, §87 Victory Points | `game-score-objective`, `game-score-secret-objective`, `game-reveal-objective`, `game-advance-phase` |
| 04 | Agenda Phase | §8 Agenda Phase | `game-draw-agenda`, `game-cast-votes`, `game-resolve-agenda` |
| 05 | Turn Flow & Command Tokens | §3 Action Phase, §20 Command Tokens, §37 Fleet Pool | `game-activate-system`, `game-end-turn`, `game-player-pass`, `game-update-command-tokens` |
| 06 | Movement | §41 Gravity Rift, §58 Movement | `game-move-ships`, `game-roll-rift-dice` |
| 07 | Production & Strategy Cards | §67 Producing Units, §68 Production, Strategy Cards | `game-produce-units`, `game-play-strategy-card`, `game-use-strategy-secondary`, `game-pass-strategy-secondary` |
| 08 | Technology | §34 Exhausted/Readied, §97 Unit Upgrades, Tech Research | `game-research-technology`, `game-exhaust-technology`, `game-ready-technology`, `game-use-technology-action` |
| 09 | Trade & Transactions | §21 Commodities, §92 Trade, §94 Transactions | `game-create-transaction`, `game-confirm-transaction`, `game-reject-transaction`, `game-rescind-transaction`, `game-play-promissory-note` |
| 10 | Exploration & Relics | §35 Exploration, §38 Frontier Tokens, §73 Relics | `game-explore-planet`, `game-explore-frontier`, `game-resolve-exploration-card`, `game-use-relic`, `game-use-relic-fragment` |
| 11 | Leaders & Abilities | §1 Abilities, §30 Deploy, §51 Leaders, §70 Purge | `game-resolve-ability`, `game-unlock-hero`, `game-unlock-commander` |
| 12 | Legendary Planets & Wormhole Nexus | §53 Legendary Planets, §100 Wormhole Nexus | `game-resolve-ability`, `game-commit-ground-forces`, `game-move-ships` |
| 13 | Control & Elimination | §25 Control, §33 Elimination | `game-land-troops`, `game-assign-hits` |

### [IMPLEMENT+TEST] Groups (14–16)

| # | Group | LRR Sections | New Code | Edge Functions Affected |
|---|-------|-------------|----------|------------------------|
| 14 | Adjacency | §6 Adjacency, §101 Wormholes | Extract adjacency logic into `supabase/functions/_shared/adjacency.ts`; `game-move-ships` calls it | `game-move-ships` |
| 15 | Capacity | §16 Capacity, §16 Transport | Extract capacity check into `supabase/functions/_shared/capacity.ts`; `game-move-ships` calls it | `game-move-ships` |
| 16 | Deals | §28 Deals | New migration `game_deals` table; new functions `game-propose-deal`, `game-confirm-deal`, `game-renege-deal` | — (new functions) |

---

## Index File (00-index.md)

The index tracks completion with a simple checkbox per prompt. Each entry notes its type ([TEST] or [IMPLEMENT+TEST]) and the output file it produces. IMPLEMENT+TEST prompts should be run after the relevant functions exist (14 and 15 after `game-move-ships` is stable; 16 is independent).

---

## Ordering Guidance

Run prompts in numbered order — highest-risk areas first.

**Groups 14 and 15 depend on group 06:** Run the group 06 movement tests first, then run groups 14 and 15. The extraction refactors in 14/15 must not break the group 06 test suite — that suite acts as a regression guard for `game-move-ships` during the extraction.

**Group 16** (Deals) is independent and can be run at any time.

IMPLEMENT+TEST prompts (14–16) should be run as planning sessions (invoke the `writing-plans` skill) rather than direct implementation sessions, since they require new migrations or function extraction.
