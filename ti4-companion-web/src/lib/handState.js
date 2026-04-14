/**
 * Derives hand state from an array of held action card rows.
 * @param {Array} cards - held rows from game_action_card_deck
 * @returns {{ cards: Array, overLimit: boolean, mustDiscard: boolean }}
 */
export function deriveHandState(cards) {
  const overLimit = cards.length > 7
  return { cards, overLimit, mustDiscard: overLimit }
}
