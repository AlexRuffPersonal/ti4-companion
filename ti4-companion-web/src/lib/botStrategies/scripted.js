// Returns { fnName, args } for the next action the scripted bot should take, or null when done.
export function getNextAction(game, players, botPlayer) {
  const phase = game.phase

  if (phase === 'strategy') {
    const picked = new Set((players ?? []).map(p => p.strategy_card).filter(Boolean))
    const available = (game.strategy_cards ?? []).filter(c => !picked.has(c.name))
    const sorted = [...available].sort((a, b) => (a.initiative ?? 0) - (b.initiative ?? 0))
    const pick = sorted[0]
    if (!pick) return null
    return { fnName: 'game-play-strategy-card', args: { game_id: game.id, strategy_card: pick.name } }
  }

  if (phase === 'action') {
    if (botPlayer.passed) return null
    const activatedThisTurn = (game.activated_systems_this_turn ?? []).includes(botPlayer.id)
    if (!activatedThisTurn) {
      return { fnName: 'game-activate-system', args: { game_id: game.id, system_key: botPlayer.home_system_key } }
    }
    const hasProduction = (botPlayer.planets ?? []).some(p => p.space_dock_unit_id != null)
    if (hasProduction) {
      return { fnName: 'game-produce-units', args: { game_id: game.id, system_key: botPlayer.home_system_key, units: [] } }
    }
    return { fnName: 'game-player-pass', args: { game_id: game.id } }
  }

  if (phase === 'attacker_assign' || phase === 'defender_assign') {
    const required = game.current_combat?.required_hits ?? 0
    const units = (botPlayer.combat_units ?? [])
    const casualties = []
    let remaining = required
    for (const priority of ['infantry', 'fighter']) {
      for (const u of units.filter(u => u.unit_type === priority)) {
        if (remaining <= 0) break
        casualties.push({ unit_id: u.id, unit_type: u.unit_type })
        remaining--
      }
    }
    for (const u of units.filter(u => !['infantry', 'fighter'].includes(u.unit_type))) {
      if (remaining <= 0) break
      casualties.push({ unit_id: u.id, unit_type: u.unit_type })
      remaining--
    }
    return { fnName: 'game-assign-hits', args: { game_id: game.id, combat_id: game.current_combat?.id, casualties } }
  }

  if (phase === 'attacker_roll' || phase === 'defender_roll') {
    return { fnName: 'game-roll-combat-dice', args: { game_id: game.id, combat_id: game.current_combat?.id } }
  }

  if (phase === 'status') {
    return { fnName: 'game-player-pass', args: { game_id: game.id } }
  }

  if (phase === 'agenda') {
    if (botPlayer.voted) return null
    return { fnName: 'game-cast-votes', args: { game_id: game.id, outcome: 'For', votes: botPlayer.available_votes ?? 0 } }
  }

  return null
}
