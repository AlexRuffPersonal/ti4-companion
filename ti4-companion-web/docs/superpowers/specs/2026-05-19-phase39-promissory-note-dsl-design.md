# Phase 39: Promissory Note DSL Effects — Design

## Overview

Phase 15 built the promissory note enforcement scaffold: state tracking (`held` / `in_play` / `discarded`), `promissoryEnforcement.ts` with `getActiveNotes()` / `returnNote()`, and `game-play-promissory-note` with state-transition logic. The call to `interpretEffects` was left commented out. This phase wires the effects for all 29 promissory notes (5 generic + 24 faction, base + PoK).

**Rules basis:** LRR §69 (Promissory Notes), §94 (Transactions). Notes are optional unless their text says "must" (§69.1a). Notes in the play area cannot be traded (§69.5a). All noted card texts sourced from `supabase/jsons/promissory-notes.json`.

---

## Sub-phases

| Phase | Scope |
|-------|-------|
| **39a** | Plumbing: wire `interpretEffects` / handler dispatch in `game-play-promissory-note`; add `promissoryHandlers.ts` with all handler stubs; add `purge_relic_fragments` DSL op; migration 048; wire Black Market Forgery as pure DSL |
| **39b** | Passive enforcement hooks added to all trigger-point edge functions (see hook table below) |
| **39c** | Implement all handler stubs in `promissoryHandlers.ts` |

---

## Migration 048

File: `supabase/migrations/048_promissory_dsl.sql`

```sql
ALTER TABLE game_player_promissory_notes
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE game_player_planets
  ADD COLUMN IF NOT EXISTS terraform_attached BOOLEAN NOT NULL DEFAULT false;
```

`metadata` stores in-play state keyed by use-case:
- Gift of Prescience: `{ "naalu_zero": true }`
- Terraform: `{ "planet_name": "Mecatol Rex" }`

---

## ResolveContext extensions (39a)

Add two optional fields to `ResolveContext` in `abilityDsl.ts`:

```typescript
noteInstanceId?: string       // the note being played
noteOriginPlayerId?: string   // origin_player_id of the note
```

`game-play-promissory-note` populates these before calling `interpretEffects` or `resolvePromissoryHandler`.

---

## New DSL op: `purge_relic_fragments`

Added to `abilityDsl.ts`. Reads `selections.fragment_type` (one of `cultural | hazardous | industrial`) and `op.count`. Queries `game_relic_fragments` for the activating player's fragments of that type and deletes `count` of them; throws `dslError` if insufficient.

Used by: Black Market Forgery (`[{ op: 'purge_relic_fragments', count: 2 }, { op: 'gain_relic' }]`).

---

## `promissoryHandlers.ts`

New file: `supabase/functions/_shared/promissoryHandlers.ts`

Exports:
```typescript
export async function resolvePromissoryHandler(
  key: string,
  ctx: ResolveContext,
  db: SupabaseClient
): Promise<void>
```

Dispatches on `key`. All handlers implemented in 39c. In 39a each stub throws:
```typescript
throw dslError(`Promissory handler '${key}' not yet implemented`, 501)
```

Handler keys and their responsibilities:

| Key | Note | Core logic |
|-----|------|-----------|
| `ceasefire` | Ceasefire | Block owner's ships from entering system; return note |
| `politicalSecret` | Political Secret | Set `vote_prevented = true` on origin; set `games.political_secret_blocked_player_id` |
| `politicalFavor` | Political Favor (Xxcha) | Spend origin's strategy token; replace revealed agenda |
| `acquiescence` | Acquiescence (Winnu) | Swap holder's strategy card assignment with origin's |
| `firesOfTheGashlai` | Fires of the Gashlai (Muaat) | Spend origin's strategy token; grant holder war sun upgrade tech |
| `creussIff` | Creuss Iff | Place/move Creuss wormhole token in a valid system |
| `terraform` | Terraform (Titans) | Set `game_player_planets.terraform_attached = true`; store planet in `metadata`; state → `in_play` |
| `warFunding` | War Funding (Barony) | Spend 2 TGs from origin; set `game_combats.reroll_allowed_player_id` |
| `tekklarLegion` | Tekklar Legion (Sardakk) | Set `game_combats.tekklar_holder_player_id`; +1 holder rolls, −1 origin rolls if opponent |
| `theCavalry` | The Cavalry (Nomad) | Set `game_combats.cavalry_active_player_id` and `cavalry_unit_id` |
| `researchAgreement` | Research Agreement (Jol-Nar) | Grant holder the same technology origin just researched |
| `cyberneticEnhancements` | Cybernetic Enhancements (L1Z1X) | Spend origin's strategy token; grant holder 1 strategy token |
| `militarySupport` | Military Support (Sol) | Spend origin's strategy token; place 2 infantry on holder's chosen planet |
| `raghsCall` | Ragh's Call (Saar) | Remove origin's ground forces from invaded planet; place on origin-controlled planet |
| `greyfireMutagen` | Greyfire Mutagen (Yin) | Set `game_system_activations.faction_abilities_blocked_player_id = origin` |
| `spyNet` | Spy Net (Yssaril) | Look at origin's action card hand; steal chosen card |
| `scepterOfDominion` | Scepter of Dominion (Mahact) | Each player with token on Mahact's command sheet places token in chosen system |
| `strikeWingAmbuscade` | Strike Wing Ambuscade (Argent) | Roll 1 additional die for chosen unit during AFB/space cannon roll |
| `crucible` | Crucible (Vuil'raith) | Set `game_system_activations.gravity_rift_immune_player_id = holder` |
| `tradeConvoys` | Trade Convoys (Hacan) | State → `in_play` (enforcement is passive; see hook table) |
| `promiseOfProtection` | Promise of Protection (Mentak) | State → `in_play` |
| `bloodPact` | Blood Pact (Empyrean) | State → `in_play` |
| `darkPact` | Dark Pact (Empyrean) | State → `in_play` |
| `stymie` | Stymie (Arborec) | State → `in_play` |
| `antivirus` | Antivirus (Nekro) | State → `in_play` |
| `giftOfPrescience` | Gift of Prescience (Naalu) | State → `in_play`; store `metadata.naalu_zero = true` |

---

## Enforcement models

### Model A — Mandatory auto-play on receipt

Handled in `game-confirm-transaction` when a note is transferred. No player action required.

| Note | On receipt | Return condition |
|------|-----------|----------------|
| Support for the Throne | Holder gains 1 VP; state → `in_play` | Holder activates system with owner's units → −1 VP + return; owner eliminated → −1 VP + return |
| Alliance | State → `in_play` | Holder activates system with owner's units → return |

### Model B — Player ACTION → `in_play` (passive in-play effect)

Holder calls `game-play-promissory-note`; handler sets state to `in_play`. Effect is checked passively in other functions. Return fires in `game-activate-system` when holder activates a system with the owner's units.

| Note | In-play effect | Enforced in |
|------|--------------|------------|
| Trade Convoys | Allow transactions with non-neighbors | `game-create-transaction` |
| Promise of Protection | Block Mentak's Pillage against holder | `game-resolve-ability` |
| Blood Pact | +4 votes when holder + Empyrean pick same outcome | `game-cast-votes` |
| Dark Pact | Both gain 1 TG when holder gives Empyrean max commodities | `game-confirm-transaction` |
| Stymie | Block Arborec production in/adjacent to holder's units | `game-produce-units` |
| Antivirus | Block Nekro's Technological Singularity against holder | `game-resolve-ability` |
| Gift of Prescience | Holder has initiative 0; Naalu loses Telepathic this round | `game-advance-phase` (strategy ordering) |

Gift of Prescience returns at **status phase end** (not activation-based), handled in `game-advance-phase`.

### Model C — Player ACTION → immediate effect + return

Holder calls `game-play-promissory-note`; handler fires immediately; note state → `held` at origin.

| Note | DSL / Handler | Effect |
|------|--------------|-------|
| Political Secret | handler `politicalSecret` | `vote_prevented = true` on origin; `games.political_secret_blocked_player_id = origin` |
| Political Favor (Xxcha) | handler `politicalFavor` | Spend origin's strategy token; replace revealed agenda |
| Acquiescence (Winnu) | handler `acquiescence` | Swap strategy card assignments between holder and origin |
| Fires of the Gashlai (Muaat) | handler `firesOfTheGashlai` | Spend origin's strategy token; grant holder war sun upgrade |
| Creuss Iff | handler `creussIff` | Place/move Creuss wormhole token |
| Black Market Forgery (Naaz-Rokha) | DSL: `[purge_relic_fragments(2), gain_relic]` | Purge 2 same-type fragments; draw top relic |
| War Funding (Barony) | handler `warFunding` | Origin −2 TGs; set `game_combats.reroll_allowed_player_id = holder` *(col pre-exists)* |
| Tekklar Legion (Sardakk) | handler `tekklarLegion` | Set `game_combats.tekklar_holder_player_id = holder` *(col pre-exists)* ; roll modifiers applied in `game-roll-ground-combat-dice` |
| The Cavalry (Nomad) | handler `theCavalry` | Set `game_combats.cavalry_active_player_id = holder` and `cavalry_unit_id` *(cols pre-exist)* ; stats applied in `game-roll-combat-dice` |
| Terraform (Titans) | handler `terraform` | `game_player_planets.terraform_attached = true`; state → `in_play`; no auto-return |

Terraform is the only Model C note that goes `in_play` permanently. The Titans player recovers it only via transaction.

### Model D — Passive auto-trigger (note stays `held`)

These notes are never explicitly played via `game-play-promissory-note`. The trigger-point function checks for held notes of the relevant type and auto-applies the effect (subject to holder consent where the UI must prompt).

| Note | Trigger event | Enforced in | Effect summary |
|------|--------------|------------|---------------|
| Ceasefire | Owner activates system containing holder's units | `game-activate-system` | Block owner's units from moving into system; return |
| Trade Agreement | Owner replenishes commodities (status phase) | `game-advance-phase` | Owner transfers all commodities to holder; return |
| Research Agreement (Jol-Nar) | Origin researches non-faction tech | `game-research-technology` | Grant holder same tech; return |
| Cybernetic Enhancements (L1Z1X) | Start of holder's turn | `game-end-turn` | Origin −1 strategy token; holder +1 strategy token; return |
| Military Support (Sol) | Start of origin's (Sol's) turn | `game-end-turn` | Origin −1 strategy token; holder places 2 infantry; return |
| Ragh's Call (Saar) | Holder commits units to land on planet | `game-commit-ground-forces` | Eject origin's ground forces from that planet to origin-controlled planet; return |
| Greyfire Mutagen (Yin) | Any system activated | `game-activate-system` | Set `faction_abilities_blocked_player_id = origin` *(col pre-exists)* ; return |
| Spy Net (Yssaril) | Start of holder's turn | `game-end-turn` | Look at + steal 1 card from origin's hand; return |
| Scepter of Dominion (Mahact) | Start of strategy phase | `game-advance-phase` | Players w/ token on Mahact's command sheet place token in chosen system; return |
| Strike Wing Ambuscade (Argent) | Holder's units roll for unit ability | `game-fire-anti-fighter-barrage`, `game-fire-space-cannon` | Roll 1 extra die for chosen unit; return |
| Crucible (Vuil'raith) | Holder activates a system | `game-activate-system` | Set `gravity_rift_immune_player_id = holder` *(col pre-exists)* ; return |

---

## `promissoryEnforcement.ts` additions

Add keys to `ActiveNotes` interface:
- `tradeAgreement` (passive check at replenish — held state, not in_play)
- `crucible`, `strikeWingAmbuscade` (held state, passive trigger)

Add helper: `getHeldNotes(gameId, noteName, db): Promise<NoteEntry[]>` — queries `state='held'` notes by name, for Model D trigger checks.

---

## Enforcement hook additions by function (39b)

| Function | Addition |
|----------|---------|
| `game-confirm-transaction` | Model A: Support for the Throne (+VP, in_play); Alliance (in_play). Dark Pact: when commodity transfer equals holder's max → both +1 TG |
| `game-activate-system` | Model B return checks (all in-play notes whose return trigger is "activate system with owner's units"). Ceasefire check. Greyfire Mutagen block. Crucible rift immunity |
| `game-advance-phase` | Trade Agreement: replenish step → transfer commodities. Scepter of Dominion: strategy phase start. Gift of Prescience: strategy phase ordering; status phase end return |
| `game-create-transaction` | Trade Convoys: allow non-neighbor if holder has it in play |
| `game-cast-votes` | Blood Pact: add 4 votes if holder + Empyrean voting same outcome |
| `game-produce-units` | Stymie: block Arborec production in/adjacent to holder's units |
| `game-roll-combat-dice` | The Cavalry: read `cavalry_active_player_id` and apply flagship stats to chosen ship |
| `game-roll-ground-combat-dice` | Tekklar Legion: read `tekklar_holder_player_id` and apply ±1 roll modifiers |
| `game-fire-anti-fighter-barrage` | Strike Wing Ambuscade: add extra die |
| `game-fire-space-cannon` | Strike Wing Ambuscade: add extra die |
| `game-research-technology` | Research Agreement: grant holder the researched tech |
| `game-commit-ground-forces` | Ragh's Call: eject origin's ground forces |
| `game-resolve-ability` | Alliance: allow holder to use origin's commander. Promise of Protection: block Pillage. Antivirus: block Technological Singularity |
| `game-end-turn` | Cybernetic Enhancements, Military Support, Spy Net: turn-start triggers |

---

## Ability definitions data format

Each note requires a row in `ability_definitions` and a row in `ability_sources` (source_type = `'promissory_note'`, source_id = promissory_notes.id).

Model C pure-DSL (Black Market Forgery):
```json
{
  "ability_key": "black_market_forgery",
  "ability_name": "Black Market Forgery",
  "trigger": { "timing": "action" },
  "effects": [
    { "op": "purge_relic_fragments", "count": 2 },
    { "op": "gain_relic" }
  ]
}
```

All other notes use `"handler": "<camelCaseKey>"` instead of `"effects"`.

---

## Files changed per sub-phase

**39a:**
- `supabase/migrations/048_promissory_dsl.sql` *(new)*
- `supabase/functions/_shared/abilityDsl.ts` — add `purge_relic_fragments` op; add `noteInstanceId`/`noteOriginPlayerId` to `ResolveContext`
- `supabase/functions/_shared/promissoryHandlers.ts` *(new)* — all stubs
- `supabase/functions/_shared/promissoryEnforcement.ts` — add `getHeldNotes`; add new keys to `ActiveNotes`
- `supabase/functions/game-play-promissory-note/index.ts` — uncomment + wire `interpretEffects` / `resolvePromissoryHandler`
- `tests/functions/game-play-promissory-note.test.js` — extend tests for handler dispatch path

**39b:**
- `supabase/functions/game-confirm-transaction/index.ts`
- `supabase/functions/game-activate-system/index.ts`
- `supabase/functions/game-advance-phase/index.ts`
- `supabase/functions/game-create-transaction/index.ts`
- `supabase/functions/game-cast-votes/index.ts`
- `supabase/functions/game-produce-units/index.ts`
- `supabase/functions/game-roll-combat-dice/index.ts`
- `supabase/functions/game-roll-ground-combat-dice/index.ts`
- `supabase/functions/game-fire-anti-fighter-barrage/index.ts`
- `supabase/functions/game-fire-space-cannon/index.ts`
- `supabase/functions/game-research-technology/index.ts`
- `supabase/functions/game-commit-ground-forces/index.ts`
- `supabase/functions/game-resolve-ability/index.ts`
- `supabase/functions/game-end-turn/index.ts`
- Tests for each modified function

**39c:**
- `supabase/functions/_shared/promissoryHandlers.ts` — implement all 25 handlers
- Tests for each handler
