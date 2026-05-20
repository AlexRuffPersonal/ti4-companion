# Phase 44 — Titans of Ul Attachments

**Date:** 2026-05-20
**Phase:** 44
**Feature area:** TE — Titans of Ul Attachments

---

## Summary

Implements two deferred Titans of Ul mechanics:

1. **Terraform** (faction promissory note) — ACTION: attach permanently to a non-home, non-Mecatol Rex planet; grants +1/+1 and all 3 planet traits.
2. **Ul The Progenitor** (hero) — ACTION: ready Elysium, attach this card to it, granting +3/+3 and Space Cannon 5(x3). Hero is never purged; it stays attached for the rest of the game.

Both share a new `ATTACH_PLANET` sub-pattern added to `_standards.md`.

---

## Rules basis

- LRR §51.12a: "The Titans of Ul's hero is not purged; it is attached to the planet Elysium instead."
- Terraform promissory note card text: "ACTION: Attach this card to a non-home planet you control other than Mecatol Rex. Its resource and influence values are each increased by 1, and it is treated as having all 3 planet traits (cultural, hazardous, and industrial)."
- Ul The Progenitor hero card text: "ACTION: Ready Elysium and attach this card to it. Its resource and influence values are each increased by 3, and it gains the Space Cannon 5 (x3) ability as if it were a unit."
- Both are action-timing effects — used as a full action during the action phase.

---

## Architecture

### Approach chosen: Targeted (no exploration card generalization)

Implement a shared `ATTACH_PLANET` helper used by Terraform and the Ul hero only. The exploration card `attach_to_planet` op (currently returning a signal without DB writes) remains deferred to Phase 41. Phase 41 can reference the same `ATTACH_PLANET` token from `_standards.md` without redesigning anything.

### No new DB tables or columns needed

- `game_player_planets.attachments UUID[]` already exists.
- `attachments` reference table already contains "Terraform" (+1/+1, all 3 traits) and "Geoform" (+3/+3, Space Cannon 5(x3)). "Geoform" is the DB representation of the hero card attached to Elysium.
- `game_players.leaders` JSONB already tracks hero status (`'unlocked'` → `'purged'`). This phase adds `'attached'` as a valid value for the Titans hero.

---

## Section 1 — DB migration (`053_titans_ul_attachments.sql`)

Registers the Ul The Progenitor hero action in the ability system (migration numbers 048–052 are reserved for planned phases):

```sql
INSERT INTO ability_definitions (ability_key, ability_name, trigger, handler, exhausts_source, purges_source)
VALUES ('ul_progenitor_hero', 'Ul The Progenitor', '{"timing":"action"}', 'ul_progenitor_hero', false, false);

INSERT INTO ability_sources (ability_id, source_type, source_id)
SELECT d.id, 'leader', l.id
FROM ability_definitions d, leaders l
WHERE d.ability_key = 'ul_progenitor_hero' AND l.name = 'Ul The Progenitor';
```

`purges_source = false` — the handler sets `leaders.hero = 'attached'` directly, bypassing the normal purge side-effect path in `game-resolve-ability`.

---

## Section 2 — `ATTACH_PLANET` sub-pattern (added to `_standards.md`)

```
ATTACH_PLANET(gameId, playerId, planetName, attachmentName)
  SELECT id FROM attachments WHERE name = attachmentName → attachId; 409 if missing
  SELECT id, attachments FROM game_player_planets WHERE game_id+player_id+planet_name; 409 'Planet not controlled'
  if attachId already in planet.attachments → 409 'Already attached'
  UPDATE game_player_planets SET attachments = array_append(attachments, attachId) WHERE id = planet.id
```

---

## Section 3 — `game-play-promissory-note` (Terraform)

New optional `planet_name?: string` field in the request body.

After fetching `noteRow`, look up `promissory_notes.name` for the note. If name is `'Terraform'`:

1. Require `planet_name` in body (400 if missing).
2. Fetch `game_player_planets` for that planet; 409 'Planet not controlled' if missing.
3. Join `tiles` on `tile_id`, find the planet entry in `tiles.planets`. Check planet `type !== 'home'` AND `planet_name !== 'Mecatol Rex'`; 409 'Cannot attach to home planet or Mecatol Rex' if either fails.
4. Call `ATTACH_PLANET(gameId, playerId, planetName, 'Terraform')`.
5. Update note state to `'in_play'` (note permanently stays attached — never discarded or returned).

Non-Terraform notes: existing logic unchanged.

---

## Section 4 — Ul The Progenitor hero

### `abilityHandlers.ts` — new handler `ul_progenitor_hero`

```
1. SELECT game_player_planets for activatingPlayerId + planet_name='Elysium'
   → 409 'Elysium not controlled' if missing
2. ATTACH_PLANET(gameId, activatingPlayerId, 'Elysium', 'Geoform')
3. UPDATE game_player_planets SET exhausted = false
   WHERE game_id=gameId AND player_id=activatingPlayerId AND planet_name='Elysium'
4. SELECT game_players.leaders WHERE id=activatingPlayerId
   set leaders.hero = 'attached'
   UPDATE game_players SET leaders = updatedLeaders WHERE id=activatingPlayerId
```

### `game-resolve-ability` — leader purge side-effect

Currently handles `purges_source` for relics and action cards only. This phase adds the leader case so all future faction heroes that are purged work correctly:

```ts
if (ab.purges_source && body.source_type === 'leader') {
  // fetch player's leaders JSONB from game_players
  // set leaders.hero = 'purged'
  // UPDATE game_players
}
```

The Ul hero bypasses this path (`purges_source = false`), but the pattern is now in place for Phases 43a–c.

---

## Section 5 — Client / UI

### `edgeFunctions.js`

Extend `playPromissoryNote(gameId, noteInstanceId)` to accept optional `planetName`:

```js
export const playPromissoryNote = (gameId, noteInstanceId, planetName) =>
  callFunction('game-play-promissory-note', {
    game_id: gameId,
    note_instance_id: noteInstanceId,
    ...(planetName ? { planet_name: planetName } : {}),
  })
```

### `LeaderCard.jsx`

Add `'attached'` as a valid status value. Display it as a badge distinct from 'purged' — e.g., "Attached to Elysium" in a muted/gold tone to indicate it's consumed but still in play.

### Planet attachment display (passive)

Once `game_player_planets.attachments` is populated with the Geoform UUID, Elysium's stats (+3/+3, Space Cannon 5(x3)) will appear via the existing attachment display path in `SystemInfoModal` / `GalaxyTab`, assuming those components already join and render attachment modifiers. If not, a small addition to `SystemInfoModal` to read `attachments[]` and sum modifiers is needed — this is tracked as a prerequisite check during implementation.

---

## Spec files (Phase 44)

| Spec file | Actual file | Status |
|---|---|---|
| `migration-053-titans-ul-attachments` | `supabase/migrations/053_titans_ul_attachments.sql` | New |
| `fn-game-play-promissory-note-p44` | `supabase/functions/game-play-promissory-note/index.ts` | Modify |
| `shared-abilityHandlers-p44` | `supabase/functions/_shared/abilityHandlers.ts` | Modify |
| `fn-game-resolve-ability-p44` | `supabase/functions/game-resolve-ability/index.ts` | Modify |
| `client-edgeFunctions-p44` | `src/lib/edgeFunctions.js` | Modify |
| `component-LeaderCard-p44` | `src/components/game/LeaderCard.jsx` | Modify |

Dependencies: `migration-048` ← all others. `shared-abilityHandlers-p44` ← `fn-game-resolve-ability-p44`. `client-edgeFunctions-p44` ← `component-LeaderCard-p44`.
