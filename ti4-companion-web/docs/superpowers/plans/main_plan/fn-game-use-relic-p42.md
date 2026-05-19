# fn-game-use-relic-p42
**File:** `supabase/functions/game-use-relic/index.ts`
**Status:** Modify
**Prereqs:** fn-game-use-relic, shared-relicEffects-p42, shared-abilityDsl-p42

## Functionality
```pseudocode
CORS; AUTH; BODY(game_id, player_id, relic_id)
// Optional: choice, use_type, planet_name, deck_type, card_ids, technology_name
GAME(phase, active_player_id); PLAYER

relicRow = fetch game_relic_deck; relicDef = fetch relics
ERR 404/409 (not found, not owned, exhausted, purged)

ACTION_RELICS = ['Stellar Converter', 'The Codex']   // Maw removed; gets phase gate instead
if relicDef.name IN ACTION_RELICS: ACTIVE_PLAYER

// Maw Of Worlds: agenda phase gate
if relicDef.name === 'Maw Of Worlds':
  ERR 409 'Not agenda phase' if game.phase !== 'agenda'

// Crown of Emphidia: two paths via use_type
if relicDef.name === 'The Crown Of Emphidia':
  if use_type === 'purge_for_vp':
    ERR 409 'Not status phase' if game.phase !== 'status'
    tomb = SELECT game_player_planets WHERE planet_name='Tomb of Emphidia' AND player_id=player.id
    ERR 409 'Tomb of Emphidia not controlled' if !tomb
    UPDATE game_players SET vp = vp + 1 WHERE id = player.id
    UPDATE game_relic_deck SET state='purged' WHERE id = relicId
    OK({ applied: 'The Crown Of Emphidia', effect: 'purge_for_vp' })
  // else fall through to explore path (use_type='explore')

ops = RELIC_EFFECTS[relicDef.name]
ERR 409 'Unknown relic' if ops undefined
context = { gameId, activatingPlayerId:player.id, chosenOption:choice,
            selections:{ planet_name, deck_type, card_ids, technology_name } }
applyAbility(ops, context, db)

// Prophet's Tears: enrich response with chosen effect
if relicDef.name === "The Prophet's Tears":
  effect = choice === 0 ? 'ignore_prerequisite' : 'draw_action_card'
  // fall through to exhaust, then return enriched OK

// Normal exhaust/purge path
if relicDef.purge_on_use: UPDATE state='purged'
elif relicDef.exhaustable: UPDATE exhausted=true

OK({ applied: relicDef.name, effect? })
```

## Tests
```pseudocode
STD_MOCKS; T401; TCORS; T400('game_id'); T400('player_id'); T400('relic_id')
T404_PLAYER; T404('relic not found'); T409('Relic not owned by player')
T409('Relic already exhausted'); T409('Relic already purged')
T409_ACTIVE — for Stellar Converter when not active player
T409('Not agenda phase') — Maw Of Worlds when phase !== 'agenda'
T409('Not your turn') — Enigmatic Device now 'Unknown relic' (removed)
it('Maw Of Worlds succeeds in agenda phase')
it("Prophet's Tears choice=0 returns effect: ignore_prerequisite")
it("Prophet's Tears choice=1 returns effect: draw_action_card")
it('Crown Of Emphidia purge_for_vp 409 if not status phase')
it('Crown Of Emphidia purge_for_vp 409 if Tomb not controlled')
it('Crown Of Emphidia purge_for_vp awards VP and purges card')
it('Crown Of Emphidia explore path exhausts card')
it('Unknown relic for Enigmatic Device (removed from RELIC_EFFECTS)')
```
