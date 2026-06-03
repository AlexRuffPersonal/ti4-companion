# Promissory Note Completions — Design

**Date:** 2026-06-03

## Summary

Almost all promissory notes were implemented in Phases 39a/b/c and subsequent phases. This spec covers the one missing note (Black Market Forgery) plus three bugs/inconsistencies surfaced by an audit of the existing implementation.

---

## 1. Black Market Forgery (new feature)

**Card:** Naaz-Rokha Alliance (PoK)
**Text:** "ACTION: Purge 2 of your relic fragments of the same type to gain 1 relic. Then, return this card to the Naaz-Rokha player."

### Backend handler — `promissoryHandlers.ts`

New `blackMarketForgery` case:

1. Require `selections.fragment_ids: string[]` with exactly 2 IDs.
2. Load both rows from `game_exploration_decks` — validate each is owned by `ctx.activatingPlayerId` (`resolved_by_player_id` match) and `state='held'`.
3. Validate both share the same `relic_fragment_type` (types cannot differ; unknown fragments are excluded — both must be typed).
4. Discard both: `UPDATE game_exploration_decks SET state='discarded', resolved_by_player_id=null WHERE id IN (...)`.
5. Draw 1 relic: `applyAbility([{ op: 'gain_relic' }], ctx, db)`.
6. Apply on-gain relic effect: `applyOnGainRelicEffect(ctx.gainedRelicName, ...)` if a relic was gained.
7. Note returns to origin player — handled by existing state-transition logic in `game-play-promissory-note` (no `purge_on_use`, no `into_play_area`).

### DB seeding

Handled by the admin-import fix described in §2 below. The ability_definition (`ability_key='blackMarketForgery'`, `handler_key='blackMarketForgery'`) and ability_source are auto-created when the admin (re-)imports promissory notes.

### Frontend — `PlayPromissoryNoteModal.jsx`

Add a fragment type picker for Black Market Forgery:

- Add `myRelicFragments` prop (array of `{ id, relic_fragment_type }` for the player's held exploration fragments).
- Add `'Black Market Forgery'` to a new `FRAGMENT_PICKER_NOTES` list.
- Render a list of the player's held typed relic fragments (grouped or flat). Player selects exactly 2 of the same type.
- Validate on submit: exactly 2 selected, both the same type.
- Pass `{ fragment_ids: [id1, id2] }` in `selections` to `onPlay`.

`myRelicFragments` is piped from the parent: `useExploration` already exposes relic fragments, and the component that opens this modal (likely `InPlayNotesPanel` or `MyPanelSection`) can pass them through.

---

## 2. Ability source fragility on re-import (architecture fix)

### Problem

`admin-import-promissory-notes/index.ts` does a full delete-all + re-insert, generating new UUIDs on every run. `game-play-promissory-note` queries `ability_sources` by note UUID (`source_id = noteRow.note_id`). After any re-import, all ability_sources links point to stale UUIDs and the function returns 404 for every note.

### Fix — extend admin-import-promissory-notes

After inserting promissory notes, the function also re-seeds ability_definitions and ability_sources:

1. **Upsert ability_definitions** by `ability_key` (ON CONFLICT DO UPDATE) for each note that has a handler. This is idempotent.
2. **Delete existing ability_sources** for `source_type='promissory_note'`.
3. For each note in the static map, query the just-inserted `promissory_notes` row by name, then insert an ability_source linking `(ability_id, source_type='promissory_note', source_id=note.id)`.

Static name→handler_key map (embedded in the import function — 29 entries):

| Note name | handler_key |
|---|---|
| Ceasefire | ceasefire |
| Political Secret | politicalSecret |
| Trade Convoys | tradeConvoys |
| Promise Of Protection | promiseOfProtection |
| Blood Pact | bloodPact |
| Dark Pact | darkPact |
| Stymie | stymie |
| Antivirus | antivirus |
| Gift Of Prescience | giftOfPrescience |
| Trade Agreement | tradeAgreement |
| Alliance | alliance |
| Support For The Throne | supportForThrone |
| Political Favor | politicalFavor |
| Acquisecence | acquiescence |
| Fires Of The Gashlai | firesOfTheGashlai |
| Cybernetic Enhancements | cyberneticEnhancements |
| Military Support | militarySupport |
| Ragh's Call | raghsCall |
| War Funding | warFunding |
| Research Agreement | researchAgreement |
| Greyfire Mutagen | greyfireMutagen |
| The Cavalry | theCavalry |
| Tekklar Legion | tekklarLegion |
| Creuss Iff | creussIff |
| Spy Net | spyNet |
| Strike Wing Ambuscade | strikeWingAmbuscade |
| Crucible | crucible |
| Scepter Of Dominion | scepterOfDominion |
| Black Market Forgery | blackMarketForgery |

Notes that go into play automatically (supportForThrone, alliance) still need ability_definition entries so `game-play-promissory-note` can look them up, even though their handler is a no-op (state transition is handled by `game-confirm-transaction` for these; if someone calls play directly, the handler can be a no-op returning cleanly).

**Trigger:** `trigger` column in ability_definitions is `JSONB NOT NULL`. For promissory notes the trigger field isn't used for routing (the switch in promissoryHandlers does that), so set it to `{"type": "play"}` for all.

### Promissory handlers for previously-unhandled notes

`supportForThrone` and `alliance` currently have no case in `resolvePromissoryHandler`. Add them as no-ops (the real effect fires from `game-confirm-transaction` when the note transfers). `tradeAgreement` likewise — add as a no-op.

---

## 3. DB state constraint (migration)

**File:** new migration `supabase/migrations/054_promissory_state.sql`

```sql
ALTER TABLE public.game_player_promissory_notes
  DROP CONSTRAINT game_player_promissory_notes_state_check;

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT game_player_promissory_notes_state_check
  CHECK (state IN ('held', 'in_play', 'discarded'));
```

This unblocks any future `purge_on_use` notes and removes the silent DB error risk in the existing code path.

---

## 4. Terraform inline handling (cleanup)

### Problem

`game-play-promissory-note/index.ts` contains a hardcoded `if (noteRefData?.name === 'Terraform')` block that:
- Reads `body.planet_name` directly from the request body
- Validates the planet isn't a home planet or Mecatol Rex
- Looks up the attachment row by name
- Updates `game_player_planets.attachments`

This duplicates/bypasses the handler pattern that every other note uses.

### Fix

**`promissoryHandlers.ts` — terraform case:**
Move all the inline logic here. The handler already receives `ctx.selections`, so pass `planet_name` via `selections.planet_name` (already used by the existing `terraform` case). The existing `terraform` case already calls `UPDATE game_player_planets SET terraform_attached=true` — extend it to also handle the attachment row lookup and update `attachments[]`, replacing the inline block entirely.

**`game-play-promissory-note/index.ts`:**
Remove the `if (noteRefData?.name === 'Terraform')` block entirely. The body already carries `body.planet_name`; ensure it's passed into `ctx.selections.planet_name` before the handler is called (it is, via `const selections = (body.selections ?? {}) as Record<string, unknown>`  — but `body.planet_name` is a top-level field, not in `selections`. Fix: map it: `if (body.planet_name) selections.planet_name = body.planet_name` before building ctx, or change the client to send `planet_name` inside `selections`).

The simpler fix: in `game-play-promissory-note`, before building `ctx`, merge `body.planet_name` into selections:
```typescript
if (body.planet_name && typeof body.planet_name === 'string') {
  selections.planet_name = body.planet_name
}
```
Then the handler can read `ctx.selections.planet_name`. Remove the inline block.

---

## 5. Wrong column names in game-play-promissory-note (bug)

The ability_sources table has a column named `ability_id` (not `ability_definition_id`), and ability_definitions has a column named `handler` (not `handler_key`). The current select in `game-play-promissory-note/index.ts` uses both wrong names:

```typescript
// WRONG:
.select('ability_definition_id, ability_definitions(id, handler_key, effects)')
const handlerKey = abilityDef?.handler_key ?? null

// CORRECT:
.select('ability_id, ability_definitions(id, handler, effects)')
const handlerKey = abilityDef?.handler ?? null
```

This means in production the query either errors or returns null for `handler_key`, so `resolvePromissoryHandler` is never called — the entire dispatch to promissoryHandlers.ts is broken. The tests all mock the DB so they pass regardless.

Fix: correct both column name references in `game-play-promissory-note/index.ts`.

---

## Files Touched

| File | Change |
|---|---|
| `supabase/migrations/054_promissory_state.sql` | New — extend state CHECK |
| `supabase/functions/admin-import-promissory-notes/index.ts` | Extend to seed ability_definitions + ability_sources |
| `supabase/functions/_shared/promissoryHandlers.ts` | Add blackMarketForgery; add no-op stubs for supportForThrone, alliance, tradeAgreement; move Terraform attachment logic in |
| `supabase/functions/game-play-promissory-note/index.ts` | Merge body.planet_name → selections; remove inline Terraform block |
| `src/components/game/PlayPromissoryNoteModal.jsx` | Add fragment picker for Black Market Forgery |
| `src/hooks/usePromissoryNotes.js` | Pass myRelicFragments to modal |
| `supabase/functions/game-play-promissory-note/index.ts` | Also fix wrong column names (`ability_definition_id`→`ability_id`, `handler_key`→`handler`) |

Also update the tests section:

- **`game-play-promissory-note.test.js`**: fix mock keys to use `ability_id` and `handler` to match corrected column names

---

## Tests

- **`admin-import-promissory-notes.test.js`**: verify ability_definitions upserted and ability_sources re-linked after import
- **`promissoryHandlers.test.js`** (or phase-specific file): blackMarketForgery — valid 2-same-type fragments → discard + relic drawn; mismatched types → 400; non-owned fragments → 409
- **`game-play-promissory-note.test.js`**: Terraform path — planet_name merged from body into selections; inline block gone
- **`PlayPromissoryNoteModal.test.jsx`**: Black Market Forgery renders fragment picker; validates 2 same-type selection
