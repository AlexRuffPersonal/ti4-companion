/**
 * Returns the player object whose turn it is, or null.
 * active_player_id is managed server-side by game-end-turn and game-player-pass.
 */
export function deriveActivePlayer(players, game) {
  if (!game?.active_player_id) return null
  return players.find(p => p.id === game.active_player_id) ?? null
}

/**
 * Returns the player object who is the current speaker, or null.
 */
export function deriveSpeaker(players, game) {
  if (!game?.speaker_player_id) return null
  return players.find(p => p.id === game.speaker_player_id) ?? null
}

/**
 * Returns a human-readable phase label for display in the game header.
 */
export function phaseLabel(phase) {
  const labels = {
    strategy: 'STRATEGY PHASE',
    action:   'ACTION PHASE',
    status:   'STATUS PHASE',
  }
  return labels[phase] ?? (phase?.toUpperCase() ?? 'UNKNOWN')
}
