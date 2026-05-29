import { dslError } from './abilityDsl.ts'
import type { ResolveContext } from './abilityDsl.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function resolvePromissoryHandler(
  key: string,
  ctx: ResolveContext,
  db: SupabaseClient
): Promise<void> {
  switch (key) {
    // ── Model B: passive / no-op stubs ────────────────────────────────────────
    // State transition in game-play-promissory-note handles setting state='in_play'.
    // These notes have passive effects enforced elsewhere (promissoryEnforcement.ts).
    case 'tradeConvoys':
    case 'promiseOfProtection':
    case 'bloodPact':
    case 'darkPact':
    case 'stymie':
    case 'antivirus':
      return  // no-op: passive effect enforced elsewhere

    case 'giftOfPrescience': {
      // Set naalu_zero metadata flag on the note instance so initiative-order logic
      // can give the holder the 0 initiative token.
      if (!ctx.noteInstanceId) throw dslError('noteInstanceId is required for giftOfPrescience')
      const { error } = await db
        .from('game_player_promissory_notes')
        .update({ metadata: { naalu_zero: true } })
        .eq('id', ctx.noteInstanceId)
      if (error) throw new Error(`giftOfPrescience: metadata update failed: ${error.message}`)
      return
    }

    // ── Model C: immediate effects ────────────────────────────────────────────

    case 'politicalSecret': {
      // Prevent the origin player from voting in the current agenda phase.
      if (!ctx.noteOriginPlayerId) throw dslError('noteOriginPlayerId is required for politicalSecret')
      const { error: voteError } = await db
        .from('game_agenda_votes')
        .upsert(
          {
            game_id: ctx.gameId,
            game_player_id: ctx.noteOriginPlayerId,
            vote_prevented: true,
          },
          { onConflict: 'game_id,game_player_id' }
        )
      if (voteError) throw new Error(`politicalSecret: vote update failed: ${voteError.message}`)
      const { error: gameError } = await db
        .from('games')
        .update({ political_secret_blocked_player_id: ctx.noteOriginPlayerId })
        .eq('id', ctx.gameId)
      if (gameError) throw new Error(`politicalSecret: game update failed: ${gameError.message}`)
      return
    }

    case 'politicalFavor': {
      // Xxcha: spend the origin player's strategy token (decrement their strategy bucket),
      // and draw/replace the revealed agenda card.
      if (!ctx.noteOriginPlayerId) throw dslError('noteOriginPlayerId is required for politicalFavor')

      // Decrement origin's strategy command token
      const { data: originPlayer, error: originError } = await db
        .from('game_players')
        .select('command_tokens')
        .eq('id', ctx.noteOriginPlayerId)
        .maybeSingle()
      if (originError || !originPlayer) throw new Error('politicalFavor: failed to load origin player')
      const tokens = { ...((originPlayer as Record<string, unknown>).command_tokens as Record<string, number> ?? {}) }
      if ((tokens.strategy ?? 0) < 1) throw dslError('Origin player has no strategy tokens to spend')
      tokens.strategy = tokens.strategy - 1
      const { error: tokenError } = await db
        .from('game_players')
        .update({ command_tokens: tokens })
        .eq('id', ctx.noteOriginPlayerId)
      if (tokenError) throw new Error(`politicalFavor: token update failed: ${tokenError.message}`)

      // Discard current agenda and draw the next one
      const { data: game, error: gameError } = await db
        .from('games')
        .select('agenda_current_card_id')
        .eq('id', ctx.gameId)
        .maybeSingle()
      if (gameError || !game) throw new Error('politicalFavor: failed to load game')
      const currentAgendaId = (game as { agenda_current_card_id: string }).agenda_current_card_id
      if (currentAgendaId) {
        await db.from('game_agenda_deck').update({ state: 'discard' }).eq('id', currentAgendaId)
      }
      const { data: newCard, error: drawError } = await db
        .from('game_agenda_deck')
        .select('id')
        .eq('game_id', ctx.gameId)
        .eq('state', 'deck')
        .order('deck_position', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (drawError) throw new Error('politicalFavor: deck query failed')
      if (!newCard) throw dslError('Agenda deck is empty')
      await db.from('game_agenda_deck').update({ state: 'revealed' }).eq('id', (newCard as { id: string }).id)
      await db.from('games').update({ agenda_current_card_id: (newCard as { id: string }).id }).eq('id', ctx.gameId)
      return
    }

    case 'acquiescence': {
      // Winnu: swap the activating player's and origin player's strategy card assignments.
      if (!ctx.noteOriginPlayerId) throw dslError('noteOriginPlayerId is required for acquiescence')
      const { data: myRow } = await db
        .from('game_strategy_card_assignments')
        .select('id, strategy_card_id')
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.activatingPlayerId)
        .maybeSingle()
      const { data: theirRow } = await db
        .from('game_strategy_card_assignments')
        .select('id, strategy_card_id')
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.noteOriginPlayerId)
        .maybeSingle()
      if (!myRow || !theirRow) throw dslError('Strategy card not assigned to one of the players')
      const myR = myRow as { id: string; strategy_card_id: string }
      const theirR = theirRow as { id: string; strategy_card_id: string }
      const { error: e1 } = await db
        .from('game_strategy_card_assignments')
        .update({ strategy_card_id: theirR.strategy_card_id })
        .eq('id', myR.id)
      if (e1) throw new Error(`acquiescence: assignment swap failed: ${e1.message}`)
      const { error: e2 } = await db
        .from('game_strategy_card_assignments')
        .update({ strategy_card_id: myR.strategy_card_id })
        .eq('id', theirR.id)
      if (e2) throw new Error(`acquiescence: assignment swap failed: ${e2.message}`)
      return
    }

    case 'firesOfTheGashlai': {
      // Muaat: origin loses 1 strategy token; holder gains the War Sun Upgrade technology.
      if (!ctx.noteOriginPlayerId) throw dslError('noteOriginPlayerId is required for firesOfTheGashlai')

      // Decrement origin's strategy token
      const { data: originPlayer, error: originError } = await db
        .from('game_players')
        .select('command_tokens')
        .eq('id', ctx.noteOriginPlayerId)
        .maybeSingle()
      if (originError || !originPlayer) throw new Error('firesOfTheGashlai: failed to load origin player')
      const tokens = { ...((originPlayer as Record<string, unknown>).command_tokens as Record<string, number> ?? {}) }
      if ((tokens.strategy ?? 0) < 1) throw dslError('Origin player has no strategy tokens')
      tokens.strategy = tokens.strategy - 1
      const { error: tokenError } = await db
        .from('game_players')
        .update({ command_tokens: tokens })
        .eq('id', ctx.noteOriginPlayerId)
      if (tokenError) throw new Error(`firesOfTheGashlai: token update failed: ${tokenError.message}`)

      // Grant holder the War Sun Upgrade tech (Magmus Reactor II)
      const { data: holderPlayer, error: holderError } = await db
        .from('game_players')
        .select('technologies')
        .eq('id', ctx.activatingPlayerId)
        .maybeSingle()
      if (holderError || !holderPlayer) throw new Error('firesOfTheGashlai: failed to load holder player')
      const techs = ((holderPlayer as Record<string, unknown>).technologies as string[]) ?? []
      if (!techs.includes('Magmus Reactor II')) {
        const { error: techError } = await db
          .from('game_players')
          .update({ technologies: [...techs, 'Magmus Reactor II'] })
          .eq('id', ctx.activatingPlayerId)
        if (techError) throw new Error(`firesOfTheGashlai: tech grant failed: ${techError.message}`)
      }
      return
    }

    case 'creussIff': {
      // Ghosts of Creuss: place a Creuss wormhole token in the target system.
      const targetSystemKey = (ctx.selections as Record<string, unknown>)?.target_system_key as string
      if (!targetSystemKey) throw dslError('target_system_key is required for creussIff')

      const { error } = await db
        .from('game_system_state')
        .upsert(
          { game_id: ctx.gameId, system_key: targetSystemKey, wormhole_type: 'creuss' },
          { onConflict: 'game_id,system_key' }
        )
      if (error) throw new Error(`creussIff: system state upsert failed: ${error.message}`)
      return
    }

    case 'terraform': {
      // Titans of Ul: attach terraform to origin player's chosen planet.
      if (!ctx.noteOriginPlayerId) throw dslError('noteOriginPlayerId is required for terraform')
      const planetName = (ctx.selections as Record<string, unknown>)?.planet_name as string
      if (!planetName) throw dslError('planet_name is required for terraform')

      const { error: planetError } = await db
        .from('game_player_planets')
        .update({ terraform_attached: true })
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.noteOriginPlayerId)
        .eq('planet_name', planetName)
      if (planetError) throw new Error(`terraform: planet update failed: ${planetError.message}`)

      // Store planet_name in note metadata so the effect can be tracked/removed later
      if (ctx.noteInstanceId) {
        const { error: metaError } = await db
          .from('game_player_promissory_notes')
          .update({ metadata: { planet_name: planetName } })
          .eq('id', ctx.noteInstanceId)
        if (metaError) throw new Error(`terraform: metadata update failed: ${metaError.message}`)
      }
      return
    }

    case 'warFunding': {
      // Barony of Letnev: origin loses 2 trade goods; holder gets reroll_allowed in current combat.
      if (!ctx.noteOriginPlayerId) throw dslError('noteOriginPlayerId is required for warFunding')

      const { data: originPlayer, error: originError } = await db
        .from('game_players')
        .select('trade_goods')
        .eq('id', ctx.noteOriginPlayerId)
        .maybeSingle()
      if (originError || !originPlayer) throw new Error('warFunding: failed to load origin player')
      const currentTg = ((originPlayer as Record<string, unknown>).trade_goods as number) ?? 0
      const newTg = Math.max(0, currentTg - 2)
      const { error: tgError } = await db
        .from('game_players')
        .update({ trade_goods: newTg })
        .eq('id', ctx.noteOriginPlayerId)
      if (tgError) throw new Error(`warFunding: trade goods update failed: ${tgError.message}`)

      // Set reroll_allowed on the active combat for the holder
      const { error: combatError } = await db
        .from('game_combats')
        .update({ reroll_allowed_player_id: ctx.activatingPlayerId })
        .eq('game_id', ctx.gameId)
        .eq('status', 'active')
      if (combatError) throw new Error(`warFunding: combat update failed: ${combatError.message}`)
      return
    }

    case 'tekklarLegion': {
      // Sardakk N'orr: set tekklar_holder on the active combat.
      const { error } = await db
        .from('game_combats')
        .update({ tekklar_holder_player_id: ctx.activatingPlayerId })
        .eq('game_id', ctx.gameId)
        .eq('status', 'active')
      if (error) throw new Error(`tekklarLegion: combat update failed: ${error.message}`)
      return
    }

    case 'theCavalry': {
      // The Nomad: set cavalry_active + cavalry_unit_id on the active combat.
      const unitId = (ctx.selections as Record<string, unknown>)?.unit_id as string
      if (!unitId) throw dslError('unit_id is required for theCavalry')
      const { error } = await db
        .from('game_combats')
        .update({ cavalry_active_player_id: ctx.activatingPlayerId, cavalry_unit_id: unitId })
        .eq('game_id', ctx.gameId)
        .eq('status', 'active')
      if (error) throw new Error(`theCavalry: combat update failed: ${error.message}`)
      return
    }

    // ── Model D: trigger-point handlers (invoked from their respective trigger fns) ──
    // These are called from game-end-turn, game-commit-ground-forces, game-activate-system,
    // game-advance-phase, or game-confirm-transaction (39b). The stubs here exist for
    // completeness; actual logic lives in the trigger functions.
    case 'ceasefire':
    case 'researchAgreement':
    case 'cyberneticEnhancements':
    case 'militarySupport':
    case 'raghsCall':
    case 'greyfireMutagen':
    case 'spyNet':
    case 'scepterOfDominion':
    case 'strikeWingAmbuscade':
    case 'crucible':
      return  // handled by trigger-point functions; no-op here

    default:
      throw dslError(`Unknown promissory handler: ${key}`, 400)
  }
}
