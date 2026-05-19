# fn-game-play-promissory-note-p39a
**File:** `supabase/functions/game-play-promissory-note/index.ts`
**Status:** Modify
**Prereqs:** fn-game-play-promissory-note (p15), shared-abilityDsl-p39a, shared-promissoryHandlers-p39a

## Functionality
- Add imports: `interpretEffects, ResolveContext` from abilityDsl.ts; `resolvePromissoryHandler` from promissoryHandlers.ts
- Fix abilitySource query to capture and check error (add `error: abilitySourceError`)
- After ownership+state check, before state transition:
  - Build `ctx: ResolveContext` with `gameId, activatingPlayerId=player.id, noteInstanceId, noteOriginPlayerId=noteRow.origin_player_id, selections`
  - If abilityDef.effects non-empty → await interpretEffects(effects, ctx, db)
  - Else if abilityDef.handler_key → await resolvePromissoryHandler(handlerKey, ctx, db)
  - Catch errors: return errorResponse with status 409/501/500 appropriately
- State transition logic (into_play_area / purge_on_use / return) remains unchanged

## Tests (game-play-promissory-note.phase39a.test.js)
- T501: handler stub not implemented → 501
- T200 effects path: effects array non-empty → interpretEffects called → 200
- T200 handler path: handler_key set, effects empty → resolvePromissoryHandler called → 200
- T409 from handler: resolvePromissoryHandler throws dslError(409) → 409
- T500 from handler: resolvePromissoryHandler throws generic Error → 500
- noteInstanceId + noteOriginPlayerId passed in ctx
