# shared-lawEffects
**File:** `supabase/functions/_shared/lawEffects.ts`
**Status:** New
**Prereqs:** migration-049-law-enforcement

## Functionality

### getActiveLaws(db, gameId) → { name, elected_target, law_id }[]
- SELECT game_laws.id, game_laws.elected_target, agendas.name
  FROM game_laws JOIN agendas ON agendas.id = game_laws.agenda_id
  WHERE game_laws.game_id = gameId AND game_laws.is_repealed = false

### assertProductionAllowed(db, gameId, unitType): Promise<void>
- laws = await getActiveLaws(db, gameId)
- if laws.find(l => l.name === 'Regulated Conscription') && unitType !== 'infantry' → throw LawError('Regulated Conscription: only infantry may be produced', 409)
- if laws.find(l => l.name === 'Articles of War') && unitType === 'pds' → throw LawError('Articles of War: PDS cannot be produced', 409)

### assertMovementAllowed(db, gameId, planetName): Promise<void>
- laws = await getActiveLaws(db, gameId)
- dmz = laws.find(l => l.name === 'Demilitarized Zone')
- if dmz && dmz.elected_target === planetName → throw LawError('Demilitarized Zone: units cannot enter this planet', 409)

### assertFleetCapacity(db, gameId, playerId, requestedFleetSize): Promise<void>
- laws = await getActiveLaws(db, gameId)
- if not laws.find(l => l.name === 'Fleet Regulations') → return
- player = SELECT command_tokens FROM game_players WHERE id = playerId
- fleetMax = player.command_tokens.fleet (the pool max column)
- if requestedFleetSize > Math.max(0, fleetMax - 2) → throw LawError('Fleet Regulations: fleet size exceeds reduced maximum', 409)

### assertCombatHitAllowed(db, gameId, unitType): Promise<void>
- laws = await getActiveLaws(db, gameId)
- if laws.find(l => l.name === 'Conventions of War') && unitType === 'fighter' → throw LawError('Conventions of War: fighters cannot be destroyed', 409)

### applyStatusPhaseLaws(db, gameId, playerUpdates: { playerId, tokenGain }[]): { playerId, tokenGain }[]
- laws = await getActiveLaws(db, gameId)
- if not laws.find(l => l.name === 'Executive Sanctions') → return playerUpdates unchanged
- return playerUpdates.map(p => ({ ...p, tokenGain: Math.min(p.tokenGain, 3) }))

### checkVpMaintenanceLaws(db, gameId, previousOwnerId, lostPlanetName): Promise<void>
- VP_MAINTENANCE_LAWS = ['Holy Planet of Ixth', 'Shard of the Throne', 'Crown of Emphidia']
- laws = await getActiveLaws(db, gameId)
- for each law where name in VP_MAINTENANCE_LAWS and elected_target === lostPlanetName:
  - find game_laws row where elected_target matches previousOwnerId (for player-elect laws) OR elected_target === lostPlanetName and the owning player_id === previousOwnerId
  - player = SELECT vp FROM game_players WHERE id = previousOwnerId
  - if player.vp > 0 → UPDATE game_players SET vp = vp - 1 WHERE id = previousOwnerId

### LawError
- extends Error with status = 409; exported for use in Edge Functions

## Tests
- getActiveLaws: returns only non-repealed laws with name + elected_target
- assertProductionAllowed: no laws → passes; Regulated Conscription + carrier → throws; Regulated Conscription + infantry → passes; Articles of War + pds → throws
- assertMovementAllowed: DMZ active + matching planet → throws; DMZ active + different planet → passes
- assertFleetCapacity: Fleet Regulations active + requestedSize > max-2 → throws; requestedSize <= max-2 → passes
- assertCombatHitAllowed: Conventions active + fighter → throws; Conventions active + cruiser → passes
- applyStatusPhaseLaws: Executive Sanctions active, gain=5 → capped at 3; no law → unchanged
- checkVpMaintenanceLaws: matching law + vp > 0 → deducts 1; different planet → no deduct; vp = 0 → no deduct
