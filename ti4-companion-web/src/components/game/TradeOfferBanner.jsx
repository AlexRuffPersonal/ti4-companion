export default function TradeOfferBanner({ trades, players, currentPlayerId, onAccept, onDecline, onViewDetails }) {
  if (!trades || trades.length === 0) return null

  return (
    <div className="flex flex-col gap-2 bg-warning/20 border-l-4 border-warning p-3 rounded">
      {trades.map(tx => {
        const proposer = players?.find(p => p.id === tx.from_player_id)
        const offer = tx.items?.offer ?? {}
        const summary = []
        if (offer.commodities > 0) summary.push(`${offer.commodities} commodities`)
        if (offer.trade_goods > 0) summary.push(`${offer.trade_goods} trade goods`)
        if ((offer.note_ids?.length ?? 0) > 0) summary.push('1 note')
        const summaryText = summary.length > 0 ? `Offers ${summary.join(', ')}` : 'Offers nothing'

        return (
          <div key={tx.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-text">
              <span className="text-bright">{proposer?.display_name}</span> {summaryText}
            </span>
            <div className="flex gap-2">
              <button className="btn-ghost text-xs" onClick={() => onViewDetails?.(tx)}>VIEW</button>
              <button className="btn-primary text-xs" onClick={() => onAccept(tx.id)}>ACCEPT</button>
              <button className="btn-ghost text-xs" onClick={() => onDecline(tx.id)}>DECLINE</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}