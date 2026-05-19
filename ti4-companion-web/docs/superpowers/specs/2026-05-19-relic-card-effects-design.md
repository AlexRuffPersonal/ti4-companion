# Relic Card Effects — Full Implementation Design

**Date:** 2026-05-19
**Scope:** All 10 official Prophecy of Kings relic cards
**Approach:** Two phases — Phase A (6 relics, no cross-system hooks) then Phase B (4 relics, deep integration)

---

## Background

Phase 17 built the relic infrastructure (`game-use-relic`, `relicEffects.ts`, `RelicPanel`) but left most effects as unimplemented stubs or with incorrect op names. This design completes all 10 relic effects.

**Relics in scope (from `supabase/jsons/relics.json`):**
Dominus Orb, Maw Of Worlds, Scepter Of Emelpar, Shard Of The Throne, Stellar Converter, The Codex, The Crown Of Emphidia, The Crown Of Thalnos, The Obsidian, The Prophet's Tears.

**Out of scope:** Enigmatic Device — this is an exploration card, not a relic. Remove it from `relicEffects.ts`.

---

## Phase A — 6 Relics (No Cross-System Hooks)

### Relics covered

| Relic | Timing | Mechanism |
|---|---|---|
| The Obsidian | On gain (auto) | Triggers in gain-relic flow; +1 secret obj limit computed dynamically |
| Maw Of Worlds | Start of agenda phase | Phase gate + exhaust all planets + gain technology |
| Scepter Of Emelpar | Reactive (when spending strategy token) | Honor-system — server exhausts card only |
| The Prophet's Tears | Reactive (when researching tech) | Exhaust + choice: ignore prereq flag on response OR draw action card |
| The Codex | Action (action phase, active player) | Purge + multi-select up to 3 cards from action discard |
| The Crown Of Emphidia | Two abilities: post-tactical exhaust; end-of-status-phase purge | Explore (full exploration system) + separate Tomb VP purge trigger |

### Migration — none required for Phase A

Secret objective limit (+1 from The Obsidian) is computed dynamically at enforcement time. No new columns needed.

### `_shared/relicEffects.ts` — revised effect map

```
'Dominus Orb':           [{ op:'dominus_orb_move' }]           // Phase B stub
'Maw Of Worlds':         [{ op:'exhaust_planets' },
                          { op:'gain_technology', count:1 }]
'Scepter Of Emelpar':    []                                     // server exhausts card only
"The Prophet's Tears":   [{ op:'choose_one', options:[
                            [{ op:'ignore_prerequisite' }],
                            [{ op:'draw_action_card', count:1 }]
                          ]}]
'The Codex':             [{ op:'take_from_discard',
                            deck:'action_card', count:3 }]
'The Crown Of Emphidia': [{ op:'explore_planet',
                            target:'any_controlled' }]
'The Crown Of Thalnos':  [{ op:'reroll_combat_dice' }]         // Phase B stub
'The Obsidian':          []                                     // handled in gain-relic flow
'Shard Of The Throne':   []                                     // Phase B
'Stellar Converter':     [{ op:'stellar_converter' }]          // Phase B stub
```

**Key fixes from Phase 17:**
- Remove `Enigmatic Device` entry entirely
- Rename `choice` → `choose_one` (Prophet's Tears)
- Rename `exhaust_all_planets` → `exhaust_planets` (Maw of Worlds — op already exists in DSL)
- Scepter of Emelpar: empty op array (card exhausts via normal `exhaustable` path)

### `_shared/abilityDsl.ts` — changes

**`take_from_discard` (updated):**
- Reads `selections.card_ids: string[]` (up to `op.count` items)
- Validates each id is in discard for this game, moves to `held`, assigns to activating player, increments `action_card_count` once per card
- Backwards-compatible: falls back to `selections.card_id` (single string) if `card_ids` absent

**`explore_planet` (stub → real):**
- Reads `selections.planet_name`, validates player controls it
- Fetches planet trait to determine exploration deck type
- Calls shared helper `drawAndResolveExplorationCard(gameId, playerId, planetName, db)` extracted from `game-explore-planet/index.ts` into `_shared/explorationEffects.ts`

**No other new ops needed for Phase A.** All other required ops (`exhaust_planets`, `gain_technology`, `choose_one`, `ignore_prerequisite`, `draw_action_card`) already exist in the DSL.

### `game-use-relic/index.ts` — changes

**`ACTION_RELICS` updated:** `['Stellar Converter', 'The Codex']` only.

**Maw Of Worlds phase gate:**
```
if relicDef.name === 'Maw Of Worlds':
  ERR 409 'Not agenda phase' if game.phase !== 'agenda'
```

**Crown of Emphidia — two `use_type` paths:**
- Client passes `use_type: 'explore'` → runs `explore_planet` op, exhausts card (normal `exhaustable` path)
- Client passes `use_type: 'purge_for_vp'` → validates `game.phase === 'status'`, checks player controls `'Tomb of Emphidia'` in `game_player_planets`, awards +1 VP, purges card. Skips normal exhaust/purge path.

**The Prophet's Tears — enriched response:**
After exhausting and applying chosen op, response includes:
```json
{ "applied": "The Prophet's Tears", "effect": "ignore_prerequisite" | "draw_action_card" }
```
Client reads `effect`: if `ignore_prerequisite`, stores flag in local state and passes `ignore_prerequisite: true` in the subsequent `game-research-technology` call.

**The Obsidian — NOT triggered via `game-use-relic`:** No Use button. Effect fires in gain-relic flow (see below).

### Gain-relic hook — `_shared/relicEffects.ts`

New exported helper `applyOnGainRelicEffect(relicName, gameId, playerId, db)` called from:
- `game-use-relic-fragment/index.ts` — after inserting new relic row
- `game-resolve-exploration-card/index.ts` — after any exploration card that grants a relic

```
applyOnGainRelicEffect(relicName, gameId, playerId, db):
  if relicName === 'The Obsidian':
    applyAbility([{ op:'draw_secret_objective' }], context, db)
  if relicName === 'Shard Of The Throne':
    UPDATE game_players SET vp = vp + 1 WHERE id = playerId
    // Phase B: also set held_by_player_id, prepare for transfer
```

### Secret objective limit enforcement

Wherever the secret objective hand limit is checked, compute:
```
baseLimit = 3  (or game setting)
obsidianCount = SELECT COUNT(*) FROM game_relic_deck grd
  JOIN relics r ON r.id = grd.relic_id
  WHERE grd.game_id=gameId AND grd.held_by_player_id=playerId
  AND grd.state != 'purged'
  AND r.name = 'The Obsidian'
effectiveLimit = baseLimit + obsidianCount
```
No migration needed — computed on demand.

### Phase A UI — `RelicPanel.jsx`

Updated interaction model per relic:

| Relic | UI |
|---|---|
| Maw Of Worlds | "Use (Agenda Phase)" button — disabled unless `phase === 'agenda'`; opens tech picker modal |
| Scepter Of Emelpar | "Exhaust" button — one click, no picker |
| The Prophet's Tears | "Exhaust" button — opens inline choice: "Ignore prerequisite" / "Draw action card" |
| The Codex | "Use (Action)" button — opens `DiscardBrowserModal` |
| Crown Of Emphidia | Two buttons: "Explore (after Action)" disabled unless `phase === 'action'`, opens planet picker; "Purge for VP" disabled unless `phase === 'status'` and player controls Tomb |
| The Obsidian | No button — passive badge: "+1 secret objective limit" |
| Shard Of The Throne | No button — passive badge: "1 VP (while held)" |
| Phase B relics | Buttons rendered but disabled with tooltip "Not yet implemented" |

**New component: `DiscardBrowserModal.jsx`**
- Props: `{ open, cards[], onConfirm(cardIds[]), onClose }`
- Lists all action cards in discard (name + text), checkbox per card, max 3 selectable
- Confirm disabled until ≥1 selected

**`edgeFunctions.js` — updated `useRelic` signature:**
```js
useRelic(gameId, playerId, relicId, {
  choice,         // 0|1 — Prophet's Tears
  use_type,       // 'explore'|'purge_for_vp' — Crown of Emphidia
  planet_name,    // Crown of Emphidia explore, planet picker result
  card_ids,       // The Codex — array of selected discard card ids
  technology_name // Maw of Worlds — tech picker result
})
```

---

## Phase B — 4 Relics (Deep Integration)

### Dominus Orb

**Card text:** "Before you move units during a tactical action, you may purge this card to move and transport units that are in systems that contain 1 of your command tokens."

**Migration:** Add `dominus_orb_player_id UUID REFERENCES game_players(id)` (nullable) to `games`.

**`game-use-relic`:** Inline handler for Dominus Orb — set `games.dominus_orb_player_id = playerRow.id`, purge card. Bypasses op array.

**`game-move-ships`:** Before rejecting "source system contains your command token," check `games.dominus_orb_player_id = active_player_id`. If match, allow.

**`game-end-turn`:** Clear `games.dominus_orb_player_id = null`.

### Stellar Converter

**Card text:** "ACTION: Choose 1 non-home, non-legendary planet other than Mecatol Rex in a system that is adjacent to 1 or more of your units that have Bombardment; destroy all units on that planet and purge all its attachments and its planet card. Then, place the destroyed planet token on that planet and purge this card."

**Server validation:**
- Planet is not in a home system, not legendary, not Mecatol Rex
- Player has at least one unit with Bombardment in an adjacent system (check `game_player_units` join `units` for Bombardment attribute, check system adjacency)

**Server execution:**
1. Delete all `game_player_units` rows `WHERE game_id=gameId AND on_planet=planetName`
2. Delete `game_player_planets` row for that planet
3. Delete any planet attachment rows for that planet
4. Delete `game_player_legendary_cards` row for that planet (already handled in Phase 21)
5. Append `planetName` to `games.destroyed_planets TEXT[]` (migration: add column) — client renders destroyed marker on hex tile
6. Purge relic

**Migration:** Add `destroyed_planets TEXT[] NOT NULL DEFAULT '{}'` to `games`.

### The Crown Of Thalnos

**Card text:** "During each combat round, this card's owner may reroll any number of dice, applying +1 to the results; any units that reroll dice but do not produce at least 1 hit are destroyed."

**Timing:** After dice are rolled in a combat round, before hits are assigned.

**Flow:**
- Client sends `game-use-relic` with `combat_id` in body, `selections.die_indices: number[]` (indices into the player's dice array to reroll)
- Server fetches combat row, fetches player's dice from `attacker_dice` or `defender_dice`
- For each selected die: reroll (new random 1–10), apply +1
- For each unit type that had dice rerolled: if none of its rerolled dice produced a hit, destroy 1 unit of that type in the combat system
- Update combat dice array and hit counts
- Crown of Thalnos has neither `exhaustable` nor `purge_on_use` — can be used every combat round freely (no state change to the relic card itself)

### Shard Of The Throne

**Card text:** "When you gain this card, gain 1 victory point; when you lose this card, lose 1 victory point. When a player gains control of a legendary planet you control or a planet you control in your home system, that player gains this card."

**On gain:** `applyOnGainRelicEffect` (Phase A) awards +1 VP to new holder.

**On loss / transfer:**
- New helper `transferRelic(relicName, fromPlayerId, toPlayerId, gameId, db)`:
  1. Update `game_relic_deck SET held_by_player_id = toPlayerId` for the Shard row
  2. Decrement old holder VP by 1
  3. Increment new holder VP by 1

**Transfer trigger — in `game-activate-system` (planet control transfer path):**
After a planet changes control, check:
- Losing player holds Shard of the Throne (`game_relic_deck` lookup)
- Planet is legendary OR is in the losing player's home system (check `planets` reference table for `is_legendary` / `home_faction`)
- If both true: call `transferRelic('Shard Of The Throne', losingPlayerId, gainingPlayerId, gameId, db)`

---

## Rules Basis

- LRR §73 — Relics: gain mechanic, usage rules, no-trade restriction
- Individual card texts from `supabase/jsons/relics.json` (canonical source)
