import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ResolveContext } from './abilityDsl.ts'

type HandlerFn = (context: ResolveContext, db: SupabaseClient) => Promise<void>

/**
 * Registry of named effect handlers for abilities that cannot be expressed
 * as composable DSL ops. Add new handlers here as complex abilities are encoded.
 *
 * Each handler receives the full resolve context and the service-role db client.
 * Throw an Error to signal resolution failure — the caller will return 500.
 */
const handlers: Record<string, HandlerFn> = {
  // Phase 43c — Commander Passive handlers

  /**
   * Mahact Il-Na Viroset: return activation token to reinforcements and allow
   * re-activation of that system. Called from game-activate-system before the
   * normal "already has token" check.
   */
  mahact_il_na_viroset: async (context, db) => {
    await db
      .from('game_system_activations')
      .update({ returned_to_reinforcements: true })
      .eq('game_id', context.gameId)
      .eq('system_key', context.systemKey)
      .eq('player_id', context.activatingPlayerId)
  },

  /**
   * L1Z1X skip planetary shield: set context flag so game-fire-bombardment
   * skips the planetary shield check.
   */
  l1z1x_skip_planetary_shield: async (context, _db) => {
    context.skipPlanetaryShield = true
  },

  /**
   * Xxcha extra vote per exhausted planet: count exhausted planets from
   * selections and add to extraVotes. game-cast-votes adds context.extraVotes
   * to the vote total.
   */
  xxcha_extra_vote_per_planet: async (context, _db) => {
    const exhaustedCount = (context.selections as { exhausted_planet_count?: number })?.exhausted_planet_count ?? 0
    context.extraVotes = (context.extraVotes ?? 0) + exhaustedCount
  },

  /**
   * Winnu combat bonus: +2 combat roll when fighting in Mecatol Rex,
   * a legendary system, or the Winnu home system.
   */
  winnu_combat_bonus: async (context, db) => {
    const systemKey = context.systemKey ?? (context.selections as { system_key?: string })?.system_key
    if (!systemKey) return

    const gameResult = await db
      .from('games')
      .select('map_tiles')
      .eq('id', context.gameId)
      .maybeSingle()
    if (!gameResult.data) return

    const mapTiles = gameResult.data.map_tiles as Record<string, string>
    const tileId = mapTiles[systemKey]
    if (!tileId) return

    const isMecatol = systemKey === '0,0'

    const tileResult = await db
      .from('tiles')
      .select('planets')
      .eq('id', tileId)
      .maybeSingle()
    const isLegendary =
      (tileResult.data?.planets as Array<{ legendary?: boolean }> | null)?.some(
        (p) => p.legendary,
      ) ?? false

    const winnuHomeResult = await db
      .from('tiles')
      .select('id')
      .eq('is_home_system', true)
      .eq('faction', 'The Winnu')
      .maybeSingle()
    const isWinnuHome = winnuHomeResult.data?.id === tileId

    if (isMecatol || isLegendary || isWinnuHome) {
      context.combatRollBonus = (context.combatRollBonus ?? 0) + 2
    }
  },

  /**
   * Hacan trade good votes: spend trade goods (2:1) for extra agenda votes.
   * Deducts TGs and adds extraVotes to context.
   */
  hacan_trade_good_votes: async (context, db) => {
    const tgSpent = (context.selections as { trade_goods_spent?: number })?.trade_goods_spent ?? 0
    if (tgSpent <= 0) return

    const playerResult = await db
      .from('game_players')
      .select('trade_goods')
      .eq('id', context.activatingPlayerId)
      .maybeSingle()
    if ((playerResult.data?.trade_goods ?? 0) < tgSpent) {
      const err = new Error('Insufficient trade goods') as Error & { status?: number }
      err.status = 409
      throw err
    }

    await db
      .from('game_players')
      .update({ trade_goods: playerResult.data!.trade_goods - tgSpent })
      .eq('id', context.activatingPlayerId)

    context.extraVotes = (context.extraVotes ?? 0) + tgSpent * 2
  },

  /**
   * Yin Omar passive: in game-research-technology, ignore one prerequisite
   * colour; in game-produce-units, grant 1 free infantry.
   */
  yin_omar_passive: async (context, _db) => {
    context.ignoreOnePrerequisite = true
    context.extraInfantryFree = 1
  },

  /**
   * Jol-Nar reroll window: push a pending commander-reroll window so the
   * UI can prompt the player to reroll combat dice.
   */
  jol_nar_reroll_window: async (context, _db) => {
    context.pendingWindows = context.pendingWindows ?? []
    context.pendingWindows.push({
      type: 'commander_reroll',
      player_id: context.activatingPlayerId,
      dice: context.currentDiceResults,
      faction: 'The Universities Of Jol-Nar',
    })
  },

  /**
   * Yssaril peek window: push a pending commander-passive window triggered
   * when another player activates a system.
   */
  yssaril_peek_window: async (context, _db) => {
    context.pendingWindows = context.pendingWindows ?? []
    context.pendingWindows.push({
      type: 'commander_passive',
      player_id: (context as Record<string, unknown>).yssarilPlayerId ?? context.activatingPlayerId,
      faction: 'The Yssaril Tribes',
      trigger: 'SYSTEM_ACTIVATED',
      activating_player_id: context.activatingPlayerId,
    })
  },

  /**
   * Empyrean return token: remove an activation token from a system and
   * return a tactic token to the Empyrean player's pool.
   */
  empyrean_return_token: async (context, db) => {
    const tokenSystem =
      context.systemKey ?? (context.selections as { system_key?: string })?.system_key
    if (!tokenSystem) return

    const empyreanPlayerId = (context as Record<string, unknown>).empyreanPlayerId as string | undefined
    if (!empyreanPlayerId) return

    await db
      .from('game_system_activations')
      .delete()
      .eq('game_id', context.gameId)
      .eq('system_key', tokenSystem)
      .eq('player_id', empyreanPlayerId)

    await db.rpc('increment_tactic_token', {
      p_player_id: empyreanPlayerId,
      p_amount: 1,
    })
  },

  /**
   * Sardakk extended commitment: set context flag so game-commit-ground-forces
   * allows the extended-commitment rule.
   */
  sardakk_extended_commitment: async (context, _db) => {
    context.sardakkExtendedCommit = true
  },

  /**
   * Naalu extra fighter: grant one fighter that does not count toward the
   * fighter capacity limit.
   */
  naalu_extra_fighter: async (context, _db) => {
    context.extraFightersFreeOfLimit = (context.extraFightersFreeOfLimit ?? 0) + 1
  },

  /**
   * Nomad free flagship: override flagship cost to 0 resources.
   */
  nomad_free_flagship: async (context, _db) => {
    context.flagshipCostOverride = 0
  },

  /**
   * Vuil'raith production limit bypass: allow 2 units to be produced beyond
   * the normal production limit.
   */
  vuil_production_limit_bypass: async (context, _db) => {
    context.freeFromLimitCount = (context.freeFromLimitCount ?? 0) + 2
  },

  // Phase 43a — Agent handlers

  /**
   * Yssaril agent: copies all other agents' text. Display-only — no DB writes.
   * Exhaust is handled by the game-resolve-ability caller.
   */
  ssruu_copies_agents: async (_context, _db) => {
    // intentionally empty
  },

  /**
   * Nekro agent: target player discards 1 action card OR spends 1 command token;
   * Nekro gains 2 trade goods in either case.
   */
  nekro_malleon: async (context, db) => {
    const sel = context.selections as {
      chosen_player_id?: string
      choice?: string
      card_id?: string
      token_bucket?: string
    }

    const targetPlayerId = sel?.chosen_player_id
    if (!targetPlayerId) {
      const err = new Error('chosen_player_id required') as Error & { status?: number }
      err.status = 400
      throw err
    }

    const choice = sel?.choice
    if (!choice) {
      const err = new Error('choice required') as Error & { status?: number }
      err.status = 400
      throw err
    }

    if (choice === 'action_card') {
      const cardId = sel?.card_id
      if (!cardId) {
        const err = new Error('card_id required') as Error & { status?: number }
        err.status = 400
        throw err
      }

      const cardResult = await db
        .from('game_action_card_deck')
        .select('id')
        .eq('id', cardId)
        .eq('held_by_player_id', targetPlayerId)
        .eq('state', 'hand')
        .maybeSingle()

      if (!cardResult.data) {
        const err = new Error('Card not in target hand') as Error & { status?: number }
        err.status = 409
        throw err
      }

      await db
        .from('game_action_card_deck')
        .update({ state: 'discarded', held_by_player_id: null })
        .eq('id', cardId)

      const targetResult = await db
        .from('game_players')
        .select('action_card_count')
        .eq('id', targetPlayerId)
        .maybeSingle()

      await db
        .from('game_players')
        .update({ action_card_count: Math.max(0, (targetResult.data?.action_card_count ?? 1) - 1) })
        .eq('id', targetPlayerId)
    } else if (choice === 'command_token') {
      const bucket = sel?.token_bucket
      if (!bucket) {
        const err = new Error('token_bucket required') as Error & { status?: number }
        err.status = 400
        throw err
      }

      const playerResult = await db
        .from('game_players')
        .select('command_tokens')
        .eq('id', targetPlayerId)
        .maybeSingle()

      const tokens = playerResult.data?.command_tokens as Record<string, number> | null
      if (!tokens || (tokens[bucket] ?? 0) <= 0) {
        const err = new Error('No command tokens in bucket') as Error & { status?: number }
        err.status = 409
        throw err
      }

      const newTokens = { ...tokens, [bucket]: tokens[bucket] - 1 }
      await db
        .from('game_players')
        .update({ command_tokens: newTokens })
        .eq('id', targetPlayerId)
    }

    // Both paths: Nekro gains 2 TG
    const nekroResult = await db
      .from('game_players')
      .select('trade_goods')
      .eq('id', context.activatingPlayerId)
      .maybeSingle()

    await db
      .from('game_players')
      .update({ trade_goods: (nekroResult.data?.trade_goods ?? 0) + 2 })
      .eq('id', context.activatingPlayerId)
  },

  /**
   * Vuil'raith agent: after target replenishes commodities, convert all of
   * target's commodities to trade goods (and capture 1 unit — display only).
   */
  stillness_of_stars: async (context, db) => {
    const sel = context.selections as { chosen_player_id?: string }
    const targetPlayerId = sel?.chosen_player_id
    if (!targetPlayerId) {
      const err = new Error('chosen_player_id required') as Error & { status?: number }
      err.status = 400
      throw err
    }

    const playerResult = await db
      .from('game_players')
      .select('commodities, trade_goods')
      .eq('id', targetPlayerId)
      .maybeSingle()

    const commodityValue = playerResult.data?.commodities ?? 0
    if (commodityValue === 0) {
      const err = new Error('Target has no commodities') as Error & { status?: number }
      err.status = 409
      throw err
    }

    await db
      .from('game_players')
      .update({
        trade_goods: (playerResult.data?.trade_goods ?? 0) + commodityValue,
        commodities: 0,
      })
      .eq('id', targetPlayerId)
  },
}

export function getHandler(name: string): HandlerFn {
  const handler = handlers[name]
  if (!handler) throw new Error(`No handler registered for: ${name}`)
  return handler
}
