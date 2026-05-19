# fn-game-activate-system-p39b
**File:** `supabase/functions/game-activate-system/index.ts`
**Status:** Modify
**Prereqs:** fn-game-activate-system-p30, shared-promissoryEnforcement-p39a

## Functionality
After activation succeeds (tactic token placed):

**Ceasefire (Model D, held):**
- getHeldNotes(gameId, 'Ceasefire', db)
- For each: if activatingPlayerId = note.ownerPlayerId AND holder has units in system → return 409 'Ceasefire is in effect'; returnNote after applying effect
- Note: check game_player_units for holderPlayerId in system_key

**Greyfire Mutagen (Model D, held):**
- getHeldNotes(gameId, 'Greyfire Mutagen', db)
- For each: UPDATE game_system_activations SET faction_abilities_blocked_player_id = note.ownerPlayerId WHERE id=activationId; returnNote

**Crucible (Model D, held):**
- getHeldNotes(gameId, 'Crucible', db)
- For each: if holderPlayerId = activatingPlayerId → UPDATE game_system_activations SET gravity_rift_immune_player_id = holderPlayerId; returnNote

**Model B in_play return checks:**
- getActiveNotes(gameId, db) for tradeConvoys, promiseOfProtection, bloodPact, darkPact, stymie, antivirus
- For each in_play note: if activatingPlayerId = note.holderPlayerId AND ownerPlayerId has units in the activated system → returnNote(instanceId, ownerPlayerId, db)

## Tests (game-activate-system.phase39b.test.js)
- Ceasefire held, owner activates system with holder units → 409
- Ceasefire held, owner activates system without holder units → no block
- Greyfire Mutagen held, any activation → faction_abilities_blocked set to owner; note returned
- Crucible held, holder activates → gravity_rift_immune set; note returned
- Model B in_play note, holder activates system with owner units → note returned
