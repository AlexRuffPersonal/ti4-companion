function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Returns { fnName, args } for the next action the random bot should take, or null when done.
export function getNextAction(game, players, botPlayer) {
  const phase = game.phase

  if (phase === 'strategy') {
    const picked = new Set((players ?? []).map(p => p.strategy_card).filter(Boolean))
    const available = (game.strategy_cards ?? []).filter(c => !picked.has(c.name))
    if (available.length === 0) return null
    const pick = randomFrom(available)
    return { fnName: 'game-play-strategy-card', args: { game_id: game.id, strategy_card: pick.name } }
  }

  if (phase === 'action') {
    if (botPlayer.passed) return null
    const activatedThisTurn = (game.activated_systems_this_turn ?? []).includes(botPlayer.id)
    const activatable = (game.activatable_systems ?? [])
    if (!activatedThisTurn) {
      const system = activatable.length > 0 ? randomFrom(activatable) : botPlayer.home_system_key
      return { fnName: 'game-activate-system', args: { game_id: game.id, system_key: system } }
    }
    const remaining = activatable.filter(s => !(game.activated_this_round ?? []).includes(s))
    if (remaining.length > 0 && Math.random() > 0.5) {
      return { fnName: 'game-activate-system', args: { game_id: game.id, system_key: randomFrom(remaining) } }
    }
    return { fnName: 'game-player-pass', args: { game_id: game.id } }
  }

  if (phase === 'attacker_assign' || phase === 'defender_assign') {
    const required = game.current_combat?.required_hits ?? 0
    const units = [...(botPlayer.combat_units ?? [])]
    const casualties = []
    for (let i = 0; i < required && units.length > 0; i++) {
      const idx = Math.floor(Math.random() * units.length)
      const u = units.splice(idx, 1)[0]
      casualties.push({ unit_id: u.id, unit_type: u.unit_type })
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
    const outcome = randomFrom(['For', 'Against'])
    const maxVotes = botPlayer.available_votes ?? 0
    const votes = maxVotes > 0 ? randomInt(1, maxVotes) : 0
    return { fnName: 'game-cast-votes', args: { game_id: game.id, outcome, votes } }
  }

  return null
}
