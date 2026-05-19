# shared-promissoryEnforcement-p39a
**File:** `supabase/functions/_shared/promissoryEnforcement.ts`
**Status:** Modify
**Prereqs:** shared-promissoryEnforcement (p15), migration-048-promissory-dsl

## Functionality
- Add to ActiveNotes interface: `tradeAgreement: NoteEntry[]`, `crucible: NoteEntry[]`, `strikeWingAmbuscade: NoteEntry[]`
- Add name mappings in nameToKey: 'trade agreement' → 'tradeAgreement', 'crucible' → 'crucible', 'strike wing ambuscade' → 'strikeWingAmbuscade'
- Initialize new keys in getActiveNotes result object
- Add `getHeldNotes(gameId: string, noteName: string, db: SupabaseClient): Promise<NoteEntry[]>`
  - Query game_player_promissory_notes WHERE game_id=gameId, state='held'
  - SELECT id, held_by_player_id, origin_player_id, promissory_notes(name)
  - Filter in JS to rows where promissory_notes.name matches noteName (case-insensitive)
  - Map to NoteEntry[] (instanceId, holderPlayerId, ownerPlayerId=origin_player_id)

## Tests
- getHeldNotes returns entries matching noteName
- getHeldNotes returns [] when no held notes match
- getActiveNotes includes tradeAgreement/crucible/strikeWingAmbuscade in result
