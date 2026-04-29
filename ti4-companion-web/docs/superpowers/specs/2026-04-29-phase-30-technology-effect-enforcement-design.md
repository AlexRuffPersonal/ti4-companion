# Phase 30: Technology Effect Enforcement

**Date:** 2026-04-29
**Status:** Approved

---

## Overview

Enforce all shared and faction technology effects server-side. Unit upgrade stat deltas are applied at combat/production time; passive techs modify phase mechanics automatically; exhaustable techs track their exhausted state per player.

**Rules basis:** LRR §90 (Technology), §97 (Unit Upgrades), §91 (Technology Strategy Card).

---

## Architecture

### Approach: Centralized `techEffects.ts` Module

A new `supabase/functions/_shared/techEffects.ts` is the single source of truth for all technology effects. All affected edge functions import from it. No database-driven effect definitions — all logic lives in code.

Three layers:
1. **Unit stat resolution** — `resolveUnitStats` applies upgrade deltas to base stats before combat/production calls
2. **Passive tech registry** — maps each tech name to its trigger point(s); `applyPassiveTechs` is called by edge functions at the appropriate hook
3. **Exhaustable tech registry** — `EXHAUSTABLE_TECHS` set used by `game-exhaust-technology` and client UI

Cross-reactive optional effects (Nullification Field, Instinct Training, Genetic Recombination) use the existing Phase 29b `pending_action_window` mechanism on `games` with new window type strings. Mandatory auto-effects (Voidwatch, Neuroglaive, E-Res Siphons) fire immediately server-side with no window.

---

## Schema (Migration 043)

```sql
-- Tech exhaustion tracking
ALTER TABLE game_players
  ADD COLUMN exhausted_technologies TEXT[] NOT NULL DEFAULT '{}';

-- Fleet Logistics: allow a second action per turn
ALTER TABLE game_players
  ADD COLUMN second_action_available BOOLEAN NOT NULL DEFAULT FALSE;
```

New `pending_action_window.type` values (no schema change — these are strings in the existing JSONB column from migration 042):
- `when_action_card_played` — Instinct Training
- `before_player_votes` — Genetic Recombination
- `after_status_phase` — Bioplasmosis
- `when_ships_enter_system` — Nullification Field

Tech readying:
- **Status phase** — `game-advance-phase` clears `exhausted_technologies = '{}'` for all players
- **Player-initiated** — `game-ready-technology` edge function (individual ready)

Invariant enforced at application layer: every name in `exhausted_technologies` must also exist in `technologies`.

---

## `techEffects.ts` Module

**File:** `supabase/functions/_shared/techEffects.ts`

### Unit Stat Resolution

```typescript
interface StatBlock {
  combat: number        // hit threshold
  dice: number          // dice rolled per attack
  move: number
  capacity: number
  production: number    // space dock production capacity
  sustain: boolean
  bombardment?: { dice: number; combat: number }
  spaceCannon?: { dice: number; combat: number }
  afb?: { dice: number; combat: number }
}

resolveUnitStats(unitType: string, baseStats: StatBlock, techs: string[]): StatBlock
```

Looks for a unit upgrade matching `unitType` in `techs[]`, reads its stat deltas from the `units` reference table, applies them on top of `baseStats`.

### Trigger Points

```typescript
type TechTrigger =
  | 'STATUS_PHASE_DRAW'          // Neural Motivator
  | 'STATUS_PHASE_TOKENS'        // Hyper Metabolism
  | 'STATUS_PHASE_START'         // Wormhole Generator
  | 'STATUS_PHASE_END'           // Bioplasmosis
  | 'STRATEGY_PHASE_END'         // Quantum Datahub Node
  | 'PRODUCTION'                 // Sarween Tools, Yin Spinner, AI Development Algorithm, Self-Assembly Routines, Hegemonic Trade Policy, Magmus Reactor, Aerie Hololattice
  | 'MOVEMENT'                   // Antimass Deflectors, Light/Wave Deflector, Gravity Drive, Aerie Hololattice (block)
  | 'SYSTEM_ACTIVATE'            // Scanlink Drone Network, Chaos Mapping, Spacial Conduit Cylinder, Aetherstream, Lazax Gate Folding (passive)
  | 'SPACE_COMBAT_START'         // Assault Cannon, Impulse Core, Dimensional Splicer
  | 'SPACE_COMBAT_END'           // Salvage Operations
  | 'SPACE_CANNON_FIRE'          // Graviton Laser System, Plasma Scoring, Antimass Deflectors defense
  | 'BOMBARDMENT'                // Plasma Scoring
  | 'GROUND_COMBAT_ROUND_START'  // Magen Defense Grid, Supercharge
  | 'GROUND_COMBAT_ROUND_END'    // Duranium Armor, Valkyrie Particle Weave
  | 'GROUND_COMBAT_WIN'          // Dacxive Animators
  | 'PLANET_CONTROL_GAINED'      // Integrated Economy
  | 'PLANET_EXPLORED'            // Pre-Fab Arcologies, Scanlink Drone Network
  | 'SHIPS_ENTER_SYSTEM'         // Voidwatch (auto, if able), Neuroglaive (auto), E-Res Siphons (auto), Nullification Field (window), Aetherstream
  | 'ACTION_CARD_PLAYED'         // Instinct Training (window), Transparasteel Plating (block)
  | 'VOTE_CAST'                  // Predictive Intelligence, Genetic Recombination (window)
  | 'ACTION_PHASE_TURN_START'    // Fleet Logistics, Transit Diodes, Chaos Mapping
  | 'TECH_RESEARCHED'            // AI Development Algorithm (ignore prereq)
  | 'AGENT_EXHAUSTED'            // Temporal Command Suite
```

### Exported Constants

```typescript
export const EXHAUSTABLE_TECHS: Set<string>
// Graviton Laser System, Bio-Stims, Magen Defense Grid, Supercharge, Predictive Intelligence,
// Transit Diodes, Sling Relay, Spacial Conduit Cylinder, AI Development Algorithm,
// Self-Assembly Routines, Vortex, X-89 Bacterial Weapon, Production Biomes, Instinct Training,
// Nullification Field, Genetic Recombination, Hegemonic Trade Policy, Lazax Gate Folding,
// Mageon Implants, Temporal Command Suite, Inheritance Systems

export const PASSIVE_TECH_TRIGGERS: Map<string, TechTrigger[]>
// Maps every non-unit-upgrade tech to its trigger points

export function applyPassiveTechs(
  trigger: TechTrigger,
  techs: string[],
  exhaustedTechs: string[],
  context: TechResolveContext,
  db: SupabaseClient
): Promise<TechEffectResult>
```

---

## New Edge Functions

### `game-exhaust-technology`

```
POST { game_id, technology_name }

- verify player in game
- fetch player (technologies, exhausted_technologies)
- ERR 409 'Technology not owned' if not in technologies
- ERR 409 'Technology cannot be exhausted' if not in EXHAUSTABLE_TECHS
- ERR 409 'Technology already exhausted' if already in exhausted_technologies
- UPDATE game_players SET exhausted_technologies = array_append(...)
- return 200
```

### `game-ready-technology`

```
POST { game_id, technology_name }

- verify player in game
- fetch player (exhausted_technologies)
- ERR 409 'Technology not exhausted' if not in exhausted_technologies
- UPDATE game_players SET exhausted_technologies = array_remove(...)
- return 200
```

---

## Modified Edge Functions

### `game-advance-phase` (Status Phase entry)

- **Neural Motivator**: draw 2 action cards instead of 1 for each owner
- **Hyper Metabolism**: gain 3 command tokens instead of 2 for each owner
- **Wormhole Generator** (Creuss): at start of status phase, each owner places/moves a Creuss wormhole token into a controlled planet system or non-home system without opponent ships
- **Bioplasmosis** (Arborec): at end of status phase, open window type `after_status_phase` for Arborec player to redistribute infantry across same/adjacent systems
- Clear `exhausted_technologies = '{}'` for all players

### `game-advance-phase` (Strategy Phase end)

- **Quantum Datahub Node** (Hacan): at end of strategy phase, Hacan owner may spend 1 strategy token + give another player 3 TGs to swap strategy cards with that player — open window type `strategy_phase_end` for Hacan to act or pass

### `game-produce-units`

- **Sarween Tools**: reduce combined unit cost by 1
- **AI Development Algorithm**: if owner exhausts it, reduce cost by count of owned unit upgrades
- **Hegemonic Trade Policy** (Winnu): owner may exhaust when producing; swap resource and influence values of 1 controlled planet until end of turn
- **Yin Spinner** (Yin): after production, place 1 infantry on a controlled planet in that system
- **Self-Assembly Routines** (PoK): owner may exhaust to place 1 mech on a controlled planet in that system
- **Magmus Reactor** (Muaat): after production in system with war sun or adjacent to supernova, gain 1 TG
- **Chaos Mapping** (Saar): at start of owner's turn, may produce 1 unit in a system containing a unit with Production
- **Aerie Hololattice** (Argent): each Argent planet containing a structure gains Production 1; apply when computing available production in that system

### `game-roll-combat-dice` / `game-roll-ground-combat-dice`

- Call `resolveUnitStats` for each unit type — apply upgraded hit thresholds and dice counts
- **Supercharge** (Naaz-Rokha): at start of ground combat round, owner may exhaust for +1 to all combat roll results
- **Duranium Armor**: after hits assigned each round, repair 1 already-damaged unit that did not use Sustain Damage this round
- **Valkyrie Particle Weave** (Sardakk): after ground combat rolls, if opponent produced 1+ hits, Sardakk produces 1 additional hit
- **Magen Defense Grid**: if owner exhausts at start of a ground combat round on a planet with a Planetary Shield unit, opponent skips combat rolls this round
- **Non-Euclidean Shielding** (Letnev): when a Letnev unit uses Sustain Damage, cancel 2 hits instead of 1

### `game-fire-space-cannon` / `game-fire-anti-fighter-barrage`

- Call `resolveUnitStats` for PDS II / Destroyer II upgraded space cannon / AFB values
- **Plasma Scoring**: one unit firing Bombardment or Space Cannon may roll 1 extra die
- **Graviton Laser System**: if owner exhausts before firing, hits must be assigned to non-fighter ships if able
- **Antimass Deflectors**: apply -1 to each die roll when opponents fire Space Cannon against this player's units
- **L4 Disruptors** (Letnev): Space Cannon cannot target Letnev units during invasion

### `game-activate-system`

- **Scanlink Drone Network**: owner may explore 1 planet in the activated system containing their units
- **Gravity Drive**: owner may apply +1 to move value of 1 ship this tactical action
- **Chaos Mapping** (Saar): prevent other players from activating asteroid fields containing Saar ships (validation check on activation)
- **Spacial Conduit Cylinder** (Jol-Nar): owner may exhaust to make another system containing their units adjacent this activation
- **Aetherstream** (Empyrean): if activated system is adjacent to an anomaly, owner or activating neighbor may apply +1 to all their ships' move values (no exhaust required)
- **Lazax Gate Folding** (Winnu, passive): if Winnu does not control Mecatol Rex, treat Mecatol's system as containing both alpha and beta wormholes during their tactical actions
- **Aerie Hololattice** (Argent): other players cannot move ships through systems containing Argent structures (validation check on movement)
- **Auto-effects when ships enter system**: check if any opponent owns `Voidwatch` (mandatory: activating player must give 1 promissory note to Empyrean owner if able), `Neuroglaive` (mandatory: activating player loses 1 fleet token), `E-Res Siphons` (mandatory: Jol-Nar gains 4 TGs), `Nullification Field` (window type `when_ships_enter_system`: Xxcha may exhaust + spend strategy token to end activating player's turn)

### `game-move-ships` (Phase 18 — spec note only, not yet built)

- **Antimass Deflectors**: ships may move into/through asteroid fields
- **Light/Wave Deflector**: ships may move through systems containing other players' ships
- **Dark Energy Tap**: ships may retreat into adjacent systems without owning units/planets; explore frontier token after tactical action in system with frontier token
- On entry into system: apply same `SHIPS_ENTER_SYSTEM` reactive tech checks as `game-activate-system`

### `game-explore-planet` (Phase 17)

- **Pre-Fab Arcologies** (Naaz-Rokha): after exploring a planet, ready that planet immediately — call `readyPlanet` after exploration resolves

### `game-commit-ground-forces` / invasion

- **L4 Disruptors** (Letnev): Space Cannon cannot fire during invasion against Letnev units (enforced in `game-fire-space-cannon`)

### `game-play-action-card` (Phase 29a/b)

- **Instinct Training** (Xxcha): when any player plays an action card, open window type `when_action_card_played` — Xxcha may exhaust + spend strategy token to cancel
- **Transparasteel Plating** (Yssaril): during owner's action phase turn, players who have passed cannot play action cards — validate in `game-play-action-card` that the playing player has not passed if Yssaril owner is currently taking their turn

### `game-cast-votes`

- **Predictive Intelligence**: owner may cast 3 extra votes; if their outcome loses, exhaust the tech (checked at `game-resolve-agenda`)
- **Genetic Recombination** (Mahact): before a player votes, open window type `before_player_votes` — Mahact may exhaust to force that player to vote for Mahact's chosen outcome or lose 1 fleet token
- **Mirror Computing** (Mentak): always-on; when Mentak owner spends trade goods, each TG is worth 2 resources or influence instead of 1 — enforced in `game-cast-votes` (influence spending) and `game-produce-units` / `game-research-technology` (resource spending)

### `game-resolve-ability` / leaders

- **Temporal Command Suite** (Nomad): after any player's agent is exhausted (detected in `game-resolve-ability` or any function that exhausts an agent), Nomad owner may exhaust this card to immediately ready that agent; if it's another player's agent, Nomad may also perform a transaction with that player — open window type `agent_exhausted`

### `game-end-turn` (Phase 12)

- **Fleet Logistics**: if owner has not taken their bonus action this turn, set `second_action_available = true`; clear it when the bonus action is taken or turn ends
- **Transit Diodes**: owner may exhaust at start of their turn to teleport up to 4 ground forces to any controlled planets

### `game-research-technology`

- **AI Development Algorithm**: owner may exhaust to ignore all prerequisites on a unit upgrade

### Special action-only techs (new edge function or extend `game-resolve-ability`)

The following techs have `ACTION:` text and function as explicit player actions during the action phase. They are triggered via player action (exhaust + effect), not passive hooks:
- **X-89 Bacterial Weapon**: exhaust + choose planet with Bombardment ships → destroy all infantry
- **Production Biomes** (Hacan): exhaust + spend strategy token → gain 4 TG, chosen player gains 2 TG
- **Sling Relay**: exhaust → produce 1 ship in any system with a space dock
- **Vortex** (Vuil'raith): exhaust → capture 1 unit type from adjacent player's reinforcements
- **Mageon Implants** (Yssaril): exhaust → look at another player's action cards, take 1
- **Lazax Gate Folding** (Winnu): ACTION half — exhaust to place 1 infantry on Mecatol Rex if controlled
- **Chaos Mapping** (Saar): ACTION half — produce 1 unit at start of turn (handled in `game-produce-units`)
- **Instinct Training** (Xxcha): exhaust + strategy token → cancel action card (via window)

These are dispatched through a new `game-use-technology-action` edge function:
```
POST { game_id, technology_name, selections: {} }
- verify tech owned and not exhausted (where applicable)
- dispatch to per-tech handler in techEffects.ts
- exhaust tech if exhaustable
```

---

## Client-Side Changes

### New files

**`src/lib/techConstants.js`**
Client-side mirror of `EXHAUSTABLE_TECHS` set and a `PASSIVE_TECHS` map. Drives UI affordances without parsing card text.

**`src/hooks/useTechnologies.js`**
Reads `technologies[]` and `exhausted_technologies[]` from the Realtime subscription in `useGame`. Exposes:
- `ownedTechnologies`, `exhaustedTechnologies`
- `isExhausted(name): boolean`
- `exhaustTech(name)`, `readyTech(name)` — call edge function wrappers

### Modified files

**`src/lib/edgeFunctions.js`**
Add wrappers: `exhaustTechnology`, `readyTechnology`, `useTechnologyAction`.

**`src/components/game/TechCard.jsx`** (Phase 28 adds text; Phase 30 adds)
- Visual exhausted state (dimmed/rotated)
- Click-to-exhaust / click-to-ready for exhaustable techs (gated by `techConstants.js`)
- Click-to-activate for ACTION techs (opens a selections modal, then calls `useTechnologyAction`)

**`src/components/game/MyPanelSection.jsx`**
Pass `exhaustedTechnologies` from `useTechnologies` to `TechCard` components.

**`component-ActionWindowBanner.jsx`** (Phase 29b)
No new component needed. New window types (`when_action_card_played`, `before_player_votes`, `after_status_phase`, `when_ships_enter_system`) are handled by the existing banner — eligible players see a prompt to act or pass.

---

## Rules Basis

- LRR §90.1 — technologies owned faceup, usable for the duration of the game
- LRR §90.6 — unit upgrades cover the base unit stats; upgraded stats replace base (§97.4)
- LRR §97.3 — white arrows on faction sheet indicate stats that improve on upgrade
- LRR §97.4 — after gaining a unit upgrade, all corresponding units use the upgrade's stats
- Individual tech card text as recorded in `supabase/jsons/technologies.json`

---

## Out of Scope

- Valefar Assimilator (Nekro) — copying faction techs is handled in Phase 16 (Leaders & Mechs)
- Faction-specific mech abilities — handled in Phase 16
- TE expansion legendary planet techs (Ang, Elysium) — deferred in POTENTIAL_TODOS
