# shared-abilityHandlers-p43c
**File:** `supabase/functions/_shared/abilityHandlers.ts`
**Status:** Modify
**Prereqs:** shared-leaderEffects-p43c

## Changes
Register named handlers for commander passive effects.

```pseudocode
'mahact_il_na_viroset': async (context, db) => {
  // Called from game-activate-system before the normal token check
  // Return both tokens to reinforcements and allow activation to proceed
  UPDATE game_system_activations
    SET returned_to_reinforcements = true
    WHERE game_id=context.gameId AND system_key=context.systemKey AND player_id=context.activatingPlayerId
  // The activation proceeds normally; caller skips the "already has token" ERR check
}

'l1z1x_skip_planetary_shield': async (context, db) => {
  // Inline in game-fire-bombardment: set context flag, caller skips shield check
  context.skipPlanetaryShield = true
}

'xxcha_extra_vote_per_planet': async (context, db) => {
  exhaustedCount = context.selections.exhausted_planet_count  // provided by client
  context.extraVotes = (context.extraVotes ?? 0) + exhaustedCount
  // game-cast-votes adds context.extraVotes to vote total
}

'winnu_combat_bonus': async (context, db) => {
  systemKey = context.systemKey
  gameId = context.gameId
  playerId = context.activatingPlayerId
  fetch game WHERE id=gameId → { map_tiles, speaker_player_id }
  fetch game_players WHERE id=playerId → { faction }
  tileId = TILE_ID(systemKey, game)
  fetch tiles WHERE id=tileId → tile
  isLegendary = tile.planets?.some(p => p.legendary)
  isMecatol = systemKey === '0,0'
  fetch game_players WHERE game_id + faction='The Winnu' → winnuPlayer
  winnuHomeTile = fetch tiles WHERE faction='The Winnu' AND is_home=true
  isHome = tile.id === winnuHomeTile.id
  if isMecatol OR isLegendary OR isHome:
    context.combatRollBonus = (context.combatRollBonus ?? 0) + 2
}

'hacan_trade_good_votes': async (context, db) => {
  tgSpent = context.selections.trade_goods_spent ?? 0
  if tgSpent > 0:
    fetch game_players WHERE id=activatingPlayerId
    ERR 409 'Insufficient trade goods' if player.trade_goods < tgSpent
    UPDATE game_players SET trade_goods -= tgSpent WHERE id=activatingPlayerId
    context.extraVotes = (context.extraVotes ?? 0) + (tgSpent * 2)
}

'yin_omar_passive': async (context, db) => {
  // In game-research-technology: one tech prerequisite colour treated as satisfied
  context.ignoreOnePrerequisite = true
  // In game-produce-units: 1 extra infantry past limit (handled inline in produce-units)
  context.extraInfantryFree = 1
}

'jol_nar_reroll_window': async (context, db) => {
  // Add pending_window of type commander_reroll with current dice
  context.pendingWindows = context.pendingWindows ?? []
  context.pendingWindows.push({
    type: 'commander_reroll',
    player_id: context.activatingPlayerId,
    dice: context.currentDiceResults,
    faction: 'The Universities Of Jol-Nar'
  })
}

'yssaril_peek_window': async (context, db) => {
  context.pendingWindows = context.pendingWindows ?? []
  context.pendingWindows.push({
    type: 'commander_passive',
    player_id: context.yssarilPlayerId,
    faction: 'The Yssaril Tribes',
    trigger: 'SYSTEM_ACTIVATED',
    activating_player_id: context.activatingPlayerId
  })
}

'empyrean_return_token': async (context, db) => {
  // Remove the command token from the system that the other player moved into
  tokenSystem = context.systemKey
  DELETE game_system_activations WHERE game_id=context.gameId AND system_key=tokenSystem
    AND player_id=context.empyreanPlayerId
  UPDATE game_players SET command_tokens.tactic_total += 1 WHERE id=context.empyreanPlayerId
}

'sardakk_extended_commitment': async (context, db) => {
  // Inline in game-commit-ground-forces: mark that Sardakk can commit from adjacent planets
  context.sardakkExtendedCommit = true
}

'naalu_extra_fighter': async (context, db) => {
  context.extraFightersFreeOfLimit = (context.extraFightersFreeOfLimit ?? 0) + 1
}

'nomad_free_flagship': async (context, db) => {
  // In game-produce-units: reduce flagship cost to 0 for this production
  context.flagshipCostOverride = 0
}

'vuil_production_limit_bypass': async (context, db) => {
  context.freeFromLimitCount = (context.freeFromLimitCount ?? 0) + 2
}
```

## Tests
Each handler is tested via the specific Edge Function that calls it.
