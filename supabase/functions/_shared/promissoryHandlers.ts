import { dslError, applyAbility } from './abilityDsl.ts'
import type { ResolveContext } from './abilityDsl.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { applyOnGainRelicEffect } from './relicEffects.ts'

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

    case 'supportForThrone':
    case 'alliance':
    case 'tradeAgreement':
      return  // no-op: state/transfer handled by game-confirm-transaction or into_play_area

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
      // Titans of Ul: holder plays card on their own planet (activating player, not origin player).
      const planetName = (ctx.selections as Record<string, unknown>)?.planet_name as string
      if (!planetName) throw dslError('planet_name is required for terraform')
      if (planetName === 'Mecatol Rex') throw dslError('Cannot attach Terraform to home planet or Mecatol Rex', 409)

      // Planet belongs to the ACTIVATING player (holder plays card on their own planet)
      const { data: planetRow } = await db
        .from('game_player_planets')
        .select('id, attachments, tiles(type)')
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.activatingPlayerId)
        .eq('planet_name', planetName)
        .maybeSingle()
      if (!planetRow) throw dslError('Planet not controlled by player', 409)

      const pr = planetRow as { id: string; attachments: string[]; tiles?: { type?: string } | null }
      if (pr.tiles?.type === 'faction') throw dslError('Cannot attach Terraform to home planet or Mecatol Rex', 409)

      // Look up the Terraform attachment row
      const { data: attachmentRow } = await db
        .from('attachments')
        .select('id')
        .eq('name', 'Terraform')
        .maybeSingle()
      const attachmentId = (attachmentRow as { id: string } | null)?.id
      if (attachmentId && (pr.attachments ?? []).includes(attachmentId)) {
        throw dslError('Already attached', 409)
      }

      // Append attachment to planet
      if (attachmentId) {
        const { error: attachErr } = await db
          .from('game_player_planets')
          .update({ attachments: [...(pr.attachments ?? []), attachmentId] })
          .eq('id', pr.id)
        if (attachErr) throw new Error(`terraform: attachment update failed: ${attachErr.message}`)
      }

      // Set terraform_attached flag
      const { error: planetError } = await db
        .from('game_player_planets')
        .update({ terraform_attached: true })
        .eq('game_id', ctx.gameId)
        .eq('player_id', ctx.activatingPlayerId)
        .eq('planet_name', planetName)
      if (planetError) throw new Error(`terraform: planet update failed: ${planetError.message}`)

      // Store planet_name in note metadata
      if (ctx.noteInstanceId) {
        await db
          .from('game_player_promissory_notes')
          .update({ metadata: { planet_name: planetName } })
          .eq('id', ctx.noteInstanceId)
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

    case 'blackMarketForgery': {
      // Naaz-Rokha: purge 2 relic fragments of the same type to gain 1 relic.
      const fragmentIds = (ctx.selections as Record<string, unknown>)?.fragment_ids as string[] | undefined
      if (!fragmentIds || !Array.isArray(fragmentIds) || fragmentIds.length !== 2) {
        throw dslError('fragment_ids must be an array of exactly 2 IDs', 400)
      }

      const { data: fragments, error: fragError } = await db
        .from('game_exploration_decks')
        .select('id, state, resolved_by_player_id, relic_fragment_type')
        .eq('game_id', ctx.gameId)
        .in('id', fragmentIds)
      if (fragError) throw new Error(`blackMarketForgery: fragment query failed: ${fragError.message}`)

      const fragList = (fragments ?? []) as Array<{
        id: string
        state: string
        resolved_by_player_id: string | null
        relic_fragment_type: string | null
      }>
      if (fragList.length !== 2) throw dslError('Fragment not found', 409)

      for (const frag of fragList) {
        if (frag.resolved_by_player_id !== ctx.activatingPlayerId) throw dslError('Fragment not owned by player', 409)
        if (frag.state !== 'held') throw dslError('Fragment not in hand', 409)
        if (!frag.relic_fragment_type) throw dslError('Fragment has no type', 409)
      }

      if (fragList[0].relic_fragment_type !== fragList[1].relic_fragment_type) {
        throw dslError('Fragments must be the same type', 409)
      }

      const { error: discardError } = await db
        .from('game_exploration_decks')
        .update({ state: 'discarded', resolved_by_player_id: null })
        .in('id', fragmentIds)
      if (discardError) throw new Error(`blackMarketForgery: discard failed: ${discardError.message}`)

      const result = await applyAbility([{ op: 'gain_relic' }], ctx, db) as { gainedRelicName?: string }
      if (result?.gainedRelicName) {
        await applyOnGainRelicEffect(result.gainedRelicName, ctx, db)
      }
      return
    }

    default:
      throw dslError(`Unknown promissory handler: ${key}`, 400)
  }
}
