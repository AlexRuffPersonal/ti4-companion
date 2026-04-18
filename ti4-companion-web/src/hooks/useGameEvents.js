import { useState, useEffect, useRef, useCallback } from 'react'

const PHASE_EVENT_MAP = {
  strategy: 'STRATEGY_PHASE_START',
  action: 'ACTION_PHASE_START',
  status: 'STATUS_PHASE_START',
  agenda: 'AGENDA_PHASE_START',
}

export function useGameEvents(game, players, currentPlayer) {
  const [currentEvent, setCurrentEvent] = useState(null)
  const prevPhaseRef = useRef(null)

  useEffect(() => {
    if (!game?.phase) return
    if (game.phase === prevPhaseRef.current) return

    const eventType = PHASE_EVENT_MAP[game.phase]
    if (eventType) {
      setCurrentEvent({ type: eventType, gameId: game.id, triggeredByPlayerId: null })
    }
    prevPhaseRef.current = game.phase
  }, [game?.phase, game?.id])

  const emitEvent = useCallback((type, data = {}) => {
    setCurrentEvent({ type, gameId: game?.id ?? null, ...data })
  }, [game?.id])

  const clearEvent = useCallback(() => {
    setCurrentEvent(null)
  }, [])

  return { currentEvent, emitEvent, clearEvent }
}
