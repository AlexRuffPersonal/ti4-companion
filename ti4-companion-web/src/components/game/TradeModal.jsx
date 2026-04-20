import { useState } from 'react'

export default function TradeModal({ currentPlayer, players, myNotes, initialNoteId, onSubmit, onClose }) {
  const [selectedRecipient, setSelectedRecipient] = useState(null)
  const [offerCommodities, setOfferCommodities] = useState(0)
  const [offerTradeGoods, setOfferTradeGoods] = useState(0)
  const [offerNoteId, setOfferNoteId] = useState(initialNoteId ?? null)
  const [requestCommodities, setRequestCommodities] = useState(0)
  const [requestTradeGoods, setRequestTradeGoods] = useState(0)
  const [requestNoteId, setRequestNoteId] = useState(null)

  const otherPlayers = players.filter(p => p.id !== currentPlayer.id)
  const recipient = otherPlayers.find(p => p.id === selectedRecipient)

  const canSubmit = !!selectedRecipient

  const handleSubmit = () => {
    onSubmit({
      to_player_id: selectedRecipient,
      offer: { commodities: offerCommodities, trade_goods: offerTradeGoods, note_ids: offerNoteId ? [offerNoteId] : [] },
      request: { commodities: requestCommodities, trade_goods: requestTradeGoods, note_ids: requestNoteId ? [requestNoteId] : [] },
    })
  }

  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">PROPOSE TRADE</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {/* Recipient selection */}
        <div>
          <label className="label text-xs mb-2 block">RECIPIENT</label>
          <select
            className="input w-full"
            value={selectedRecipient ?? ''}
            onChange={(e) => setSelectedRecipient(e.target.value || null)}
          >
            <option value="">Select a player...</option>
            {otherPlayers.map(p => (
              <option key={p.id} value={p.id}>{p.display_name}</option>
            ))}
          </select>
        </div>

        {selectedRecipient && (
          <div className="grid grid-cols-2 gap-4">
            {/* You send */}
            <div className="panel-inset">
              <p className="label text-xs mb-3">YOU SEND</p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label text-xs text-gold">Commodities</label>
                  <input
                    type="number"
                    min={0}
                    max={currentPlayer.commodities}
                    value={offerCommodities}
                    onChange={(e) => setOfferCommodities(Math.min(currentPlayer.commodities, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label text-xs text-gold">Trade Goods</label>
                  <input
                    type="number"
                    min={0}
                    max={currentPlayer.trade_goods}
                    value={offerTradeGoods}
                    onChange={(e) => setOfferTradeGoods(Math.min(currentPlayer.trade_goods, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="input w-full"
                  />
                </div>
                {myNotes.length > 0 && (
                  <div>
                    <label className="label text-xs text-gold">Note (optional)</label>
                    <select
                      className="input w-full"
                      value={offerNoteId ?? ''}
                      onChange={(e) => setOfferNoteId(e.target.value || null)}
                    >
                      <option value="">None</option>
                      {myNotes.map(n => (
                        <option key={n.id} value={n.id}>{n.promissory_notes?.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* You receive */}
            <div className="panel-inset">
              <p className="label text-xs mb-3">YOU RECEIVE</p>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="label text-xs text-gold">Commodities</label>
                  <input
                    type="number"
                    min={0}
                    value={requestCommodities}
                    onChange={(e) => setRequestCommodities(Math.max(0, parseInt(e.target.value) || 0))}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label text-xs text-gold">Trade Goods</label>
                  <input
                    type="number"
                    min={0}
                    value={requestTradeGoods}
                    onChange={(e) => setRequestTradeGoods(Math.max(0, parseInt(e.target.value) || 0))}
                    className="input w-full"
                  />
                </div>
                {recipient?.held_notes?.length > 0 && (
                  <div>
                    <label className="label text-xs text-gold">Note (optional)</label>
                    <select
                      className="input w-full"
                      value={requestNoteId ?? ''}
                      onChange={(e) => setRequestNoteId(e.target.value || null)}
                    >
                      <option value="">None</option>
                      {recipient.held_notes.map(n => (
                        <option key={n.id} value={n.id}>{n.promissory_notes?.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
          <button className="btn-primary text-xs" disabled={!canSubmit} onClick={handleSubmit}>
            PROPOSE
          </button>
        </div>
      </div>
    </div>
  )
}