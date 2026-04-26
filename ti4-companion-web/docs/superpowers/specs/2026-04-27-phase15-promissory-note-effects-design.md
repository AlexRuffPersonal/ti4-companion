# Phase 15: Promissory Note Effects — Design Spec

## Overview

`game-play-promissory-note` currently only transitions state. Phase 15 encodes every promissory note's effect as a DSL op sequence or named handler (matching the pattern established by `game-resolve-ability`) and wires enforcement hooks into all affected Edge Functions.

All 30 notes (5 generic + 25 faction-specific) are in scope. Data is already imported into `promissory_notes`. No `ability_definitions` are linked to any note yet.

---

## Section 1: DB & State Machine

### Reference data update (before migration)

Seven notes are missing `into_play_area: true` in `supabase/jsons/promissory-notes.json`. Update the JSON and re-import via admin before deploying:

| Note | Current | Correct |
|------|---------|---------|
| Trade Convoys | false | true |
| Promise Of Protection | false | true |
| Blood Pact | false | true |
| Dark Pact | false | true |
| Stymie | false | true |
| Antivirus | false | true |
| Gift Of Prescience | false | true |

### Migration 032

**`game_player_promissory_notes`** — update state CHECK constraint:

```sql
-- Remove 'played'; add 'in_play'
-- Old: CHECK (state IN ('held', 'played', 'discarded'))
-- New:
CHECK (state IN ('held', 'in_play', 'discarded'))
```

No existing rows use `played` in production (the play flow was never wired to the UI).

**`games`** — Political Secret flag:

```sql
ALTER TABLE public.games
  ADD COLUMN political_secret_blocked_player_id UUID REFERENCES public.game_players(id);
```

Set by the `political_secret` handler when the note is played; cleared to `NULL` by `game-resolve-agenda` after the agenda resolves.

**`game_system_activations`** — activation-scoped promissory flags:

```sql
ALTER TABLE public.game_system_activations
  ADD COLUMN movement_blocked_player_id        UUID REFERENCES public.game_players(id),
  ADD COLUMN faction_abilities_blocked_player_id UUID REFERENCES public.game_players(id),
  ADD COLUMN gravity_rift_immune_player_id     UUID REFERENCES public.game_players(id);
```

**`game_combats`** — combat-scoped promissory flags:

```sql
ALTER TABLE public.game_combats
  ADD COLUMN reroll_allowed_player_id  UUID REFERENCES public.game_players(id),
  ADD COLUMN extra_die_player_id       UUID REFERENCES public.game_players(id),
  ADD COLUMN cavalry_active_player_id  UUID REFERENCES public.game_players(id),
  ADD COLUMN cavalry_unit_id           UUID REFERENCES public.game_player_units(id),
  ADD COLUMN tekklar_holder_player_id  UUID REFERENCES public.game_players(id);
```

All nullable; set by the relevant handler, read by the relevant combat function.

### State machine

```
held → in_play      notes that go faceup in the play area (ongoing effects active)
held → discarded    purge_on_use notes only
in_play → held      return condition triggered; held_by_player_id reset to origin_player_id
```

One-shot notes (immediate effect, then return to owner) never enter `in_play`. After resolving, `game-play-promissory-note` sets `held_by_player_id = origin_player_id`, `state = 'held'`.

The `into_play_area` flag on the `promissory_notes` reference row drives whether a note transitions to `in_play` or returns immediately after resolution.

---

## Section 2: Core Architecture

### `game-play-promissory-note` (modified)

Universal entry point for all holder-initiated and ACTION notes.

1. Validate caller holds the note and `state = 'held'`
2. Look up `ability_definition` via `ability_sources` (`source_type = 'promissory_note'`, `source_id = note_id`)
3. Build `ResolveContext` from request body `selections` (same pattern as `game-resolve-ability`)
4. Call `interpretEffects` or named handler
5. Transition state:
   - `into_play_area = true` → `state = 'in_play'`, `held_by_player_id` unchanged
   - `into_play_area = false` → `held_by_player_id = origin_player_id`, `state = 'held'`
   - `purge_on_use = true` → `state = 'discarded'`

### `game-confirm-transaction` (modified — auto-fire hook)

After confirming a transaction that includes a promissory note transfer:
- If note is **Support For The Throne**: immediately set `state = 'in_play'`, `held_by_player_id = recipient`; grant recipient 1 VP
- If note is **Alliance**: immediately set `state = 'in_play'`, `held_by_player_id = recipient`
- Detection: check `promissory_notes.name` for these two notes (the only auto-fire-on-receipt notes per LRR 1.23a)

### `_shared/promissoryEnforcement.ts` (new)

Shared helper imported by all enforcement-aware Edge Functions.

```ts
interface ActiveNotes {
  supportForThrone:     { holderPlayerId: string; ownerPlayerId: string }[]
  alliance:             { holderPlayerId: string; ownerPlayerId: string }[]
  tradeConvoys:         { holderPlayerId: string; ownerPlayerId: string }[]
  promiseOfProtection:  { holderPlayerId: string; ownerPlayerId: string }[]
  bloodPact:            { holderPlayerId: string; ownerPlayerId: string }[]
  darkPact:             { holderPlayerId: string; ownerPlayerId: string }[]
  stymie:               { holderPlayerId: string; ownerPlayerId: string }[]
  antivirus:            { holderPlayerId: string; ownerPlayerId: string }[]
  giftOfPrescience:     { holderPlayerId: string; ownerPlayerId: string }[]
  politicalSecret:      { blockedPlayerId: string }[]
  ceasefire:            { blockedPlayerId: string; systemKey: string }[]
  greyfire:             { blockedPlayerId: string; activationId: string }[]
}

export async function getActiveNotes(gameId: string, db: SupabaseClient): Promise<ActiveNotes>
```

Queries `game_player_promissory_notes` where `state = 'in_play'`, joins `promissory_notes` for name, returns typed result. One DB round-trip per calling function.

### `_shared/abilityHandlers.ts` (extended)

Named handlers added for all notes whose effects cannot be expressed as DSL ops. See Section 4.

---

## Section 3: DSL Ops

### Implement existing stubs

| Op | Implementation |
|----|---------------|
| `gain_command_tokens` | Add N tokens to `command_tokens[pool]` in `game_players`; `pool: 'strategy' \| 'tactic' \| 'fleet'` |
| `place_units` | Insert N units of `unit_type` into `game_player_units` for `selections.chosen_planet` |
| `gain_technology` | Append `tech_key` or `selections.chosen_technology_id` to `game_players.technologies[]` |

### New ops

| Op | Parameters | Effect |
|----|-----------|--------|
| `remove_strategy_token` | `target: 'self' \| 'origin_player'`, `amount: number`, `if_able?: bool` | Decrement `command_tokens.strategy` for target player; skip silently if `if_able` and already 0 |
| `remove_fleet_token` | `target: 'self' \| 'origin_player'`, `amount: number` | Decrement `command_tokens.fleet` for target player |
| `give_commodities_from_player` | `target: 'origin_player'` | Read origin player's `commodities`; add to activating player's `commodities`; set origin player's `commodities = 0` |

### Notes encoded entirely as DSL

| Note | DSL sequence |
|------|-------------|
| Cybernetic Enhancements | `remove_strategy_token(origin, 1)` → `gain_command_tokens(self, strategy, 1)` |
| Military Support | `remove_strategy_token(origin, 1, if_able)` → `choose_one([place_units(infantry, 2, chosen_planet), noop])` |
| Fires Of The Gashlai | `remove_fleet_token(origin, 1)` → `gain_technology(war_sun_upgrade_key)` |
| Trade Agreement | `give_commodities_from_player(origin)` |
| Research Agreement | `gain_technology(chosen_technology_id)` — tech ID passed via `selections` |

---

## Section 4: Named Handlers

### Group A — Self-contained immediate effects

| Handler | Effect |
|---------|--------|
| `ceasefire` | Sets `movement_blocked_player_id` on the current `game_system_activations` row for the origin player |
| `political_favor` | Marks current `game_agenda_deck` row as discarded; draws next agenda from top of deck |
| `ragh_s_call` | Moves all Saar `game_player_units` ground forces off `selections.chosen_planet` to another Saar-controlled planet (`selections.destination_planet`) |
| `creuss_iff` | Inserts or moves a wormhole token entry in `game_system_state` for `selections.chosen_system` |
| `spy_net` | Transfers `selections.chosen_card_id` from Yssaril's `game_action_card_deck` (state `held`) to activating player; updates both players' `action_card_count` |
| `black_market_forgery` | Purges 2 relic fragments of matching type from activating player; draws top relic from `game_relic_deck` |
| `terraform` | Updates `game_player_planets` for `selections.chosen_planet`: +1 resource, +1 influence, all 3 traits; stores note instance ID as the attachment reference |
| `acquisecence` | Swaps `strategy_card` values between holder and Winnu player in `game_players` |
| `scepter_of_dominion` | For each player with a token on the Mahact command sheet (`game_players.tokens_captured_from`): removes 1 token from their reinforcements and places it in `selections.chosen_system` via `game_system_state` |

### Group B — Flag-setting handlers

| Handler | Flag | Enforced in |
|---------|------|-------------|
| `political_secret` | `political_secret_blocked_player_id` on `games` (cleared by `game-resolve-agenda`) | `game-cast-votes`, `game-resolve-ability` |
| `greyfire_mutagen` | `faction_abilities_blocked_player_id` on `game_system_activations` | `game-resolve-ability` (faction ability check) |

### Group C — Combat-integrated handlers

| Handler | Flag set | Enforced in |
|---------|---------|-------------|
| `war_funding` | Deducts 2 TG from origin player; sets `reroll_allowed_player_id` on `game_combats` | `game-roll-combat-dice` exposes reroll in response |
| `strike_wing_ambuscade` | Sets `extra_die_player_id` on `game_combats` | `game-roll-combat-dice`, `game-fire-anti-fighter-barrage` add 1 die |
| `the_cavalry` | Sets `cavalry_active_player_id` + `cavalry_unit_id` on `game_combats` | Combat roll functions apply Nomad flagship stats to that unit |
| `tekklar_legion` | Sets `tekklar_holder_player_id` on `game_combats` | `game-roll-ground-combat-dice` applies +1 to holder, -1 to N'orr |
| `crucible` | Sets `gravity_rift_immune_player_id` on `game_system_activations` | Movement function skips gravity rift rolls for that player |

### Group D — Play action is trivial (state → `in_play` only)

These notes have no immediate effect. Their `ability_definition` gets `effects: []`. Enforcement is entirely in `getActiveNotes` consumers.

| Note | Enforced in |
|------|------------|
| Trade Convoys | `game-create-transaction`: skip neighbor check if holder active |
| Promise Of Protection | Pillage handler in `game-resolve-ability` |
| Blood Pact | `game-cast-votes`: +4 votes if holder and Empyrean vote same outcome |
| Dark Pact | `game-confirm-transaction`: grant 1 TG each when holder's commodity gift = their max value |
| Stymie | `game-produce-units`: block Arborec production in/adjacent to holder's units |
| Antivirus | Technological Singularity handler in `game-resolve-ability` |

### Return conditions for in-play notes

`game-activate-system` calls `getActiveNotes` after activation. If the activating player activates a system containing the origin player's units, all matching in-play notes are returned (`held_by_player_id = origin_player_id`, `state = 'held'`). Covers: Support For The Throne (also loses 1 VP), Alliance, Trade Convoys, Promise Of Protection, Blood Pact, Dark Pact, Stymie, Antivirus.

Gift Of Prescience returns at `game-advance-phase` on the status → agenda transition instead.

---

## Section 5: Edge Function Hooks

| Function | Phase | Changes |
|----------|-------|---------|
| `game-confirm-transaction` | 8 (existing) | Auto-fire Support For The Throne + Alliance on receipt; Dark Pact ongoing check |
| `game-activate-system` | existing | In-play note return checks; Ceasefire movement block; Greyfire flag |
| `game-cast-votes` | existing | Political Secret block; Blood Pact +4 votes |
| `game-resolve-ability` | existing | Political Secret faction ability block; Antivirus / Promise Of Protection / Alliance enforcement |
| `game-produce-units` | 12 | Stymie production block |
| `game-create-transaction` | existing | Trade Convoys non-neighbor permission |
| `game-play-strategy-card` | 12 | Trade SC replenish triggers Trade Agreement: execute `give_commodities_from_player`, return note |
| `game-research-technology` | existing | Jol-Nar tech research triggers Research Agreement: execute `gain_technology`, return note |
| `game-resolve-agenda` | existing | Clear `political_secret_blocked_player_id` on `games` after agenda resolves |
| `game-advance-phase` | existing | Status → agenda: return Gift Of Prescience to Naalu |
| `game-roll-combat-dice` | 13 | Tekklar Legion, War Funding, The Cavalry, Strike Wing Ambuscade flags |
| `game-fire-anti-fighter-barrage` | 13 | Strike Wing Ambuscade extra die |
| `game-roll-ground-combat-dice` | 11 | Tekklar Legion +1/-1 modifiers |
| Movement function | 12/14 | Ceasefire movement block; Crucible gravity rift immunity |

---

## Section 6: UI

### New hook: `usePromissoryNotes`

Fetches `game_player_promissory_notes` with Realtime subscription. Exposes:
- `heldNotes` — notes the current player holds (`state = 'held'`)
- `inPlayNotes` — all in-play notes across all players (`state = 'in_play'`)
- `playNote(noteInstanceId, selections)` — calls `game-play-promissory-note`

### New component: `PlayPromissoryNoteModal`

Generic modal opened via Play button on any held note. Shows note text and renders selection inputs:

| Selection | Input |
|-----------|-------|
| `chosen_player` | Player picker |
| `chosen_planet` | Planet picker from controlled planets |
| `chosen_technology_id` | Technology picker (Research Agreement: from Jol-Nar's recent research) |
| `chosen_card_id` | Card picker from revealed opponent hand (Spy Net: server pre-flight query returns masked hand) |
| `chosen_unit_id` | Unit picker from active combat units (The Cavalry) |
| None | Confirm button only |

Server returns 409 if timing is invalid; modal surfaces this as an error message.

### New component: `InPlayNotesPanel`

Displays all active in-play notes (public information per LRR 69.1). Shows holder name, origin faction/color, and note text. Rendered in the game sidebar.

### Modified: `MyPanelSection` (Phase 12)

Each held promissory note gets a Play button → opens `PlayPromissoryNoteModal`. Notes matching the current player's own faction/color are greyed out and unplayable (LRR 69.2).

### Modified: `CombatModal` + `GroundCombatModal` (Phases 13/14 + 11/14)

Combat-timing notes surface as contextual buttons within the relevant combat modal:

| Note | Location |
|------|----------|
| War Funding | Start of each combat round — "Use War Funding"; after play, reroll controls appear |
| The Cavalry | Start of space combat — "Deploy The Cavalry" → unit picker |
| Strike Wing Ambuscade | Before AFB roll — "Use Strike Wing Ambuscade" |
| Tekklar Legion | Start of invasion combat — "Deploy Tekklar Legion" |

### Timing approach

The client does not detect reactive timing windows. All reactive notes (Ceasefire, Political Secret, Trade Agreement, etc.) are always accessible in the player's hand. Players play them manually at the correct moment; the server validates and returns 409 if the timing is wrong. Non-active players can always access their hand since `MyPanelSection` renders regardless of whose turn it is.

---

## Note Classification Reference

| Note | Faction | Trigger type | Handler/DSL |
|------|---------|-------------|-------------|
| Support For The Throne | generic | auto-fire on receipt | auto (game-confirm-transaction) |
| Alliance | generic (PoK) | auto-fire on receipt | auto (game-confirm-transaction) |
| Trade Convoys | Hacan | ACTION → in_play | effects: [] |
| Promise Of Protection | Mentak | ACTION → in_play | effects: [] |
| Blood Pact | Empyrean | ACTION → in_play | effects: [] |
| Dark Pact | Empyrean | ACTION → in_play | effects: [] |
| Stymie | Arborec | ACTION → in_play | effects: [] |
| Antivirus | Nekro | reactive → in_play | effects: [] |
| Terraform | Titans (PoK) | ACTION | handler: terraform |
| Fires Of The Gashlai | Muaat | ACTION | DSL |
| Black Market Forgery | Naaz-Rokha (PoK) | ACTION | handler: black_market_forgery |
| Trade Agreement | generic | reactive | DSL |
| Cybernetic Enhancements | L1Z1X | reactive | DSL |
| Military Support | Sol | reactive | DSL |
| Research Agreement | Jol-Nar | reactive | DSL |
| Ceasefire | generic | reactive | handler: ceasefire |
| Political Secret | generic | reactive | handler: political_secret |
| Political Favor | Xxcha | reactive | handler: political_favor |
| Scepter Of Dominion | Mahact (PoK) | reactive | handler: scepter_of_dominion |
| Strike Wing Ambuscade | Argent (PoK) | reactive | handler: strike_wing_ambuscade |
| War Funding | Letnev | reactive | handler: war_funding |
| Greyfire Mutagen | Yin | reactive | handler: greyfire_mutagen |
| The Cavalry | Nomad (PoK) | reactive | handler: the_cavalry |
| Tekklar Legion | N'orr | reactive | handler: tekklar_legion |
| Ragh's Call | Saar | reactive | handler: ragh_s_call |
| Crucible | Vuil'raith (PoK) | reactive | handler: crucible |
| Gift Of Prescience | Naalu | reactive → in_play | handler: gift_of_prescience |
| Acquisecence | Winnu | reactive | handler: acquisecence |
| Creuss Iff | Creuss | reactive | handler: creuss_iff |
| Spy Net | Yssaril | reactive | handler: spy_net |
