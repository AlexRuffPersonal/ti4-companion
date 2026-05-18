# shared-abilityDsl-p40
**File:** `supabase/functions/_shared/abilityDsl.ts`
**Status:** Modify
**Prereqs:** migration-049-law-enforcement, shared-lawEffects

## Functionality

### New op: repeal_law
- law_id = context.selections.law_id (required; throw dslError if missing)
- SELECT id FROM game_laws WHERE id = law_id AND game_id = context.gameId; 409 if not found
- UPDATE game_laws SET is_repealed = true WHERE id = law_id
- SELECT agenda_id FROM game_laws WHERE id = law_id
- UPDATE game_agenda_deck SET state = 'repealed' WHERE game_id = context.gameId AND agenda_id = agenda_id
- Note: does NOT deduct VP (LRR §98.6 + FAQ)

### New op: use_minister_of_war
- Requires migration-049 minister_of_war_unlocked column
- laws = await getActiveLaws(db, context.gameId)
- mow = laws.find(l => l.name === 'Minister of War'); if not found → throw dslError('Minister of War is not in play')
- if mow.elected_target !== context.activatingPlayerId → throw dslError('Only the elected player may use Minister of War')
- planet_name = context.selections.planet_name (the elected planet stored in mow.elected_target is the player; actual planet must be passed via selections) — NOTE: Minister of War elects a PLAYER not a planet; the player exhausts any planet they control. So: planet_name = context.selections.planet_name; validate player owns + planet not exhausted
- SELECT id, exhausted FROM game_player_planets WHERE game_id = gameId AND player_id = activatingPlayerId AND planet_name = planet_name; 409 if not found or exhausted
- UPDATE game_player_planets SET exhausted = true WHERE id = planet.id
- UPDATE game_players SET minister_of_war_unlocked = true WHERE id = activatingPlayerId

## Tests
- repeal_law: sets is_repealed = true; sets deck state to 'repealed'; missing law_id → 409; law not in game → 409
- use_minister_of_war: law not in play → 409; caller not elected player → 409; planet not owned → 409; planet already exhausted → 409; success → planet exhausted + flag set
