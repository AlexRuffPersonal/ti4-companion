export default function TransactionLogModal({ transactions, players, onClose }) {
  // Filter to confirmed only
  const confirmed = transactions.filter(tx => tx.status === 'confirmed')

  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-2xl flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="label">TRADE LOG</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {confirmed.length === 0 ? (
          <p className="text-dim text-sm font-body">No trades yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {confirmed.slice().reverse().map(tx => {
              const from = players?.find(p => p.id === tx.from_player_id)
              const to = players?.find(p => p.id === tx.to_player_id)
              const offer = tx.items?.offer ?? {}
              const request = tx.items?.request ?? {}
              return (
                <div key={tx.id} className="panel-inset text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-bright">{from?.display_name} → {to?.display_name}</span>
                    <span className="text-dim">Round {tx.confirmed_at}</span>
                  </div>
                  <div className="text-dim">
                    Offered: {offer.commodities ?? 0} comm, {offer.trade_goods ?? 0} trade goods
                    {(offer.note_ids?.length ?? 0) > 0 && ' + note'}
                  </div>
                  <div className="text-dim">
                    Requested: {request.commodities ?? 0} comm, {request.trade_goods ?? 0} trade goods
                    {(request.note_ids?.length ?? 0) > 0 && ' + note'}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}