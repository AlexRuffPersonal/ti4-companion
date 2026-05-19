# shared-promissoryHandlers-p39c
**File:** `supabase/functions/_shared/promissoryHandlers.ts`
**Status:** Modify
**Prereqs:** shared-promissoryHandlers-p39a, fn-game-confirm-transaction-p39b, fn-game-activate-system-p39b, fn-game-advance-phase-p39b, fn-game-end-turn-p39b

## Functionality
Replace all 501 stubs with full implementations. Each handler is called from game-play-promissory-note after caller holds note and before state transition.

**Model B stubs (just return; state transition handles in_play):**
- tradeConvoys, promiseOfProtection, bloodPact, darkPact, stymie, antivirus: no-op (passive effect enforced elsewhere)
- giftOfPrescience: UPDATE game_player_promissory_notes SET metadata = '{"naalu_zero":true}' WHERE id=ctx.noteInstanceId

**Model C immediate effects:**
- politicalSecret: UPDATE game_agenda_votes SET vote_prevented=true WHERE game_player_id=ctx.noteOriginPlayerId; UPDATE games SET political_secret_blocked_player_id=ctx.noteOriginPlayerId
- politicalFavor (Xxcha): UPDATE game_strategy_card_plays SET status='inactive' (spend origin's strategy token); draw/replace revealed agenda card
- acquiescence (Winnu): swap ctx.activatingPlayerId and ctx.noteOriginPlayerId strategy card assignments
- firesOfTheGashlai (Muaat): origin −1 strategy token; grant holder war_sun_upgrade tech
- creussIff: INSERT/UPDATE game_system_state for Creuss wormhole at selections.target_system_key
- terraform: UPDATE game_player_planets SET terraform_attached=true WHERE player_id=ctx.noteOriginPlayerId AND planet_name=selections.planet_name; UPDATE game_player_promissory_notes SET metadata='{planet_name}' WHERE id=ctx.noteInstanceId
- warFunding (Barony): origin −2 TGs; UPDATE game_combats SET reroll_allowed_player_id=ctx.activatingPlayerId
- tekklarLegion (Sardakk): UPDATE game_combats SET tekklar_holder_player_id=ctx.activatingPlayerId
- theCavalry (Nomad): UPDATE game_combats SET cavalry_active_player_id=ctx.activatingPlayerId, cavalry_unit_id=selections.unit_id

**Model D handlers (called from trigger-point functions, not game-play-promissory-note):**
- ceasefire, researchAgreement, cyberneticEnhancements, militarySupport, raghsCall, greyfireMutagen, spyNet, scepterOfDominion, strikeWingAmbuscade, crucible: these are invoked from their respective trigger functions (39b); each stub in promissoryHandlers can delegate or remain as internal helpers

## Tests (promissoryHandlers.phase39c.test.js — one describe block per handler)
- giftOfPrescience: metadata naalu_zero set on note instance
- politicalSecret: vote_prevented=true on origin; game.political_secret_blocked_player_id set
- politicalFavor: origin strategy token spent; agenda replaced
- acquiescence: strategy card assignments swapped
- firesOfTheGashlai: origin −1 strategy token; holder gets war_sun_upgrade tech
- creussIff: wormhole token placed in target system
- terraform: terraform_attached=true on planet; metadata stored
- warFunding: origin −2 TGs; reroll_allowed_player_id=holder
- tekklarLegion: tekklar_holder_player_id=holder
- theCavalry: cavalry_active_player_id=holder; cavalry_unit_id=selection
