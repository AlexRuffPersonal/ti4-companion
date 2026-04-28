# shared-eliminationHandler
**File:** `supabase/functions/_shared/eliminationHandler.ts`
**Status:** New
**Prereqs:** migration-039-elimination

## Functionality

```pseudocode
export async function checkAndEliminate(db, gameId): Promise<string[]>

// 1. Detect eligible players (§33.1)
nonElimPlayers = select game_players where game_id=gameId AND eliminated=false

FOR each player:
  hasProduction = EXISTS game_player_units where player_id=player.id
    AND unit_type IN (select unit_type from units where production IS NOT NULL)
  hasGroundForces = EXISTS game_player_units where player_id=player.id
    AND unit_type IN ('infantry','mech')
  hasPlanets = EXISTS game_system_state where controller_player_id=player.id AND game_id=gameId

  IF !hasProduction AND !hasGroundForces AND !hasPlanets:
    eliminate(db, gameId, player)  // runs in transaction

return eliminatedPlayerIds[]

// ─────────────────────────────────────────────
async function eliminate(db, gameId, player):

  // §33.2 — remove units and activation tokens
  delete game_player_units where player_id=player.id AND game_id=gameId
  delete game_system_activations where player_id=player.id AND game_id=gameId

  // §33.2 — strip planet control
  update game_system_state set controller_player_id=null
    where controller_player_id=player.id AND game_id=gameId

  // §33.4 — redistribute promissory notes
  FOR each note in player's hand:
    IF note.faction_colour matches another active player → return to that player's hand
    ELSE → discard (remove row)

  // §33.5 — discard action cards
  delete game_player_action_cards where player_id=player.id AND game_id=gameId

  // §33.6 — clear strategy cards
  update game_players set strategy_card=null, strategy_card_2=null where id=player.id

  // §33.7 — shuffle secret objectives back to deck
  update game_player_secret_objectives set status='in_deck'
    where player_id=player.id AND game_id=gameId

  // §33.8 — speaker handoff
  game = GAME(speaker_player_id)
  IF game.speaker_player_id = player.id:
    activePlayers = select game_players where game_id=gameId AND eliminated=false AND id!=player.id
      ORDER BY seat_index ASC
    nextSpeaker = activePlayers[(player.seat_index + 1) wrapping to first if none found]
    update games set speaker_player_id=nextSpeaker.id where id=gameId

  // §33.10e — Mahact captured tokens (eliminated player has others' tokens)
  IF player.tokens_captured_from is non-empty:
    FOR each [ownerId, count] in player.tokens_captured_from:
      update game_players set command_tokens['tactic_total'] += count where id=ownerId
    update game_players set tokens_captured_from='{}' where id=player.id

  // §33.10e — Mahact has token from this eliminated player (no action — token remains)
  // §33.10b — Creuss wormholes remain on board (no action)
  // §33.10a — Nekro assimilator on eliminated player's tech remains (no action)

  // §33.11 — captured units: deferred (unit capture not yet implemented)

  // Mark eliminated
  update game_players set eliminated=true where id=player.id
```

## Tests

```pseudocode
STD_MOCKS (mock db, eliminationHandler imported)

// Detection
it('no units + no planets → returns player in eliminatedIds')
it('has Space Dock only (no planets, no ground forces) → eliminated')
it('has infantry on controlled planet → not eliminated')
it('has only ships with no production stat, no planets, no ground forces → eliminated')
it('already eliminated player skipped in detection')

// Speaker handoff (§33.8)
it('speaker eliminated → speaker passes to next seat_index')
it('speaker eliminated → wraps around if speaker has highest seat_index')
it('speaker eliminated → skips already-eliminated players when selecting next')

// Mahact §33.10e
it('eliminated player has tokens_captured_from entries → tactic_total incremented for original owners')
it('tokens_captured_from cleared after redistribution')

// Promissory notes §33.4
it('foreign promissory notes returned to matching active player')
it('own-faction promissory notes discarded')

// Cards
it('action cards deleted §33.5')
it('secret objectives set to in_deck §33.7')
it('strategy cards nulled §33.6')

// Multi-elimination
it('two players simultaneously eligible → both eliminated; returns both ids')
```
