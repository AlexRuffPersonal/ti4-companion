export default function StrategyCardModal({
  activePay,
  responses,
  myPlayerId,
  players,
  abilityDefs,
  isMyTurnToRespond,
  onUseSecondary,
  onPassSecondary,
  onClose = () => {},
}) {
  if (!activePay) return null

  const cardHolder = players.find(p => p.id === activePay.played_by_player_id)
  const isCardHolder = myPlayerId === activePay.played_by_player_id

  const secondaryAbility = abilityDefs.find(a =>
    a.ability_sources?.some(s =>
      s.source_type === 'strategy_card' &&
      String(s.source_id) === String(activePay.card_number) &&
      s.role === 'secondary'
    )
  )

  const sortedResponses = [...responses].sort((a, b) => a.initiative_order - b.initiative_order)
  const nextPendingResponse = sortedResponses.find(r => r.status === 'pending')
  const nextPlayer = players.find(p => p.id === nextPendingResponse?.player_id)

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <p className="label">STRATEGY CARD {activePay.card_number}</p>
        <p className="text-muted text-sm">{cardHolder?.display_name ?? 'Unknown'} played the primary ability</p>

        {isCardHolder ? (
          <>
            {sortedResponses.map(response => {
              const respPlayer = players.find(p => p.id === response.player_id)
              return (
                <p key={response.player_id} className="text-sm text-text">
                  {respPlayer?.display_name ?? 'Unknown'}: {response.status}
                </p>
              )
            })}
            <button className="btn-ghost text-xs mt-2" onClick={onClose}>
              CLOSE
            </button>
          </>
        ) : isMyTurnToRespond ? (
          <>
            {secondaryAbility && (
              <p className="text-sm text-bright">{secondaryAbility.description}</p>
            )}
            <div className="flex gap-2">
              <button
                className="btn-primary text-xs flex-1"
                disabled={!secondaryAbility}
                onClick={() => onUseSecondary(secondaryAbility?.id)}
              >
                USE SECONDARY
              </button>
              <button
                className="btn-ghost text-xs flex-1"
                onClick={onPassSecondary}
              >
                PASS
              </button>
            </div>
          </>
        ) : (
          <p className="text-muted text-sm text-center">
            Waiting for {nextPlayer?.display_name ?? 'a player'}…
          </p>
        )}
      </div>
    </div>
  )
}
