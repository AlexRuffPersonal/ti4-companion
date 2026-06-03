# fn-game-play-promissory-note-p45
**File:** `supabase/functions/game-play-promissory-note/index.ts`
**Status:** Modify
**Prereqs:** fn-game-play-promissory-note-p44, migration-054-promissory-state

## Functionality

### Fix 1 — Wrong column names in ability_sources query

Current (broken):
```ts
.select('ability_definition_id, ability_definitions(id, handler_key, effects)')
const abilityDef = ... as { id: string; handler_key: string | null; effects: unknown[] } | null
const handlerKey = abilityDef?.handler_key ?? null
```

Fixed (correct DB column names):
```ts
.select('ability_id, ability_definitions(id, handler, effects)')
const abilityDef = ... as { id: string; handler: string | null; effects: unknown[] } | null
const handlerKey = abilityDef?.handler ?? null
```

### Fix 2 — Merge body.planet_name into selections before building ctx

Add before `const ctx: ResolveContext = { ... }`:
```ts
if (body.planet_name && typeof body.planet_name === 'string') {
  selections.planet_name = body.planet_name
}
```

### Fix 3 — Remove inline Terraform block

Delete the entire `if (noteRefData?.name === 'Terraform') { ... }` block (lines ~90–122 in current file). The `terraform` handler in `promissoryHandlers.ts` now owns this logic.

Also remove `name` from the `promissory_notes` select if it was added; the select is just `purge_on_use, into_play_area`.

## Tests (`tests/functions/game-play-promissory-note.test.js`)

### Fix mock keys (regression — must update before testing anything else)

In `mockDb`, change the ability_sources mock data from:
```js
{ ability_definition_id: 'ability-src-1', ability_definitions: { id: 'ability-def-1', handler_key: 'someHandler', effects: [] } }
```
to:
```js
{ ability_id: 'ability-src-1', ability_definitions: { id: 'ability-def-1', handler: 'someHandler', effects: [] } }
```

### planet_name merged into selections

Add test: when `body.planet_name = 'Mecatol Rex'` is present, `ctx.selections.planet_name === 'Mecatol Rex'` when the handler is called (verify via spy on `resolvePromissoryHandler`).

### Inline Terraform block gone

Verify that calling the function with `note_name = 'Terraform'` no longer triggers any `game_player_planets` query inside the play function itself (that logic is now in the handler). The Terraform integration test moves to `promissoryHandlers.phase45.test.js`.
