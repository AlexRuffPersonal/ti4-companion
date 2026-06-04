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
/**
 * Returns true if the given userId belongs to the current speaker.
 */
export function isSpeaker(players, game, userId) {
  if (!game?.speaker_player_id) return false
  const speaker = players.find(p => p.id === game.speaker_player_id)
  return speaker?.user_id === userId
}

export function phaseLabel(phase) {
  const labels = {
    strategy: 'STRATEGY PHASE',
    action:   'ACTION PHASE',
    status:   'STATUS PHASE',
  }
  return labels[phase] ?? (phase?.toUpperCase() ?? 'UNKNOWN')
}

const FACTION_ICON_MAP = new Map([
  ['the arborec', 'arborec'],
  ['the barony of letnev', 'barony'],
  ['the clan of saar', 'clan-saar'],
  ['the embers of muaat', 'embers-muaat'],
  ['the emirates of hacan', 'emirates-hacan'],
  ['the federation of sol', 'federation-sol'],
  ['the ghosts of creuss', 'ghosts-creuss'],
  ['the l1z1x mindnet', 'l1z1x'],
  ['the mentak coalition', 'mentak'],
  ['the naalu collective', 'naalu'],
  ['the nekro virus', 'nekro-virus'],
  ["the sardakk n'orr", 'sardakk-norr'],
  ['the universities of jol-nar', 'jol-nar'],
  ['the winnu', 'winnu'],
  ['the xxcha kingdom', 'xxcha'],
  ['the yin brotherhood', 'yin'],
  ['the yssaril tribes', 'yssaril'],
  ['the argent flight', 'argent-flight'],
  ['the empyrean', 'empyrean'],
  ['the mahact gene-sorcerers', 'mahact'],
  ['the naaz-rokha alliance', 'naaz-rokha'],
  ['the nomad', 'nomad'],
  ['the titans of ul', 'titans'],
  ["the vuil'raith cabal", 'vuil-raith'],
])

/**
 * Returns the icon file slug for a canonical TI4 faction name, or null if unknown.
 */
export function factionIconSlug(factionName) {
  if (!factionName) return null
  return FACTION_ICON_MAP.get(factionName.toLowerCase()) ?? null
}
