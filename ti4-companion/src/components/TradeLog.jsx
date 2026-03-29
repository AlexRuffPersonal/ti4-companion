import { useState } from 'react'
import { X, ArrowRight, Plus } from 'lucide-react'

export default function TradeLog({ gameState, myPlayerId, canEdit, onClose, onLogTransaction }) {
  const { players, transactions, round } = gameState
  const [fromId, setFromId] = useState(myPlayerId)
  const [toId, setToId] = useState('')
  const [items, setItems] = useState('')

  function handleLog() {
    if (!fromId || !toId || !items.trim()) return
    onLogTransaction(fromId, toId, items.trim())
    setItems('')
  }

  const roundTransactions = (transactions || []).filter(t => t.round === round)
  const allTransactions = [...(transactions || [])].reverse()

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void animate-slide-up">
      <div className="starfield" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-hull/80">
        <div className="flex items-center gap-2">
          <ArrowRight size={14} className="text-plasma" />
          <span className="font-display text-sm text-bright tracking-wider">TRADE LOG</span>
        </div>
        <button className="text-dim hover:text-text transition-colors" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 pb-8 flex flex-col gap-4">

        {/* Log a transaction */}
        <div className="panel p-4 flex flex-col gap-3">
          <span className="label">Log Transaction</span>

          <div className="flex items-center gap-2">
            <select className="input flex-1" value={fromId} onChange={e => setFromId(e.target.value)}>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ArrowRight size={14} className="text-dim flex-shrink-0" />
            <select className="input flex-1" value={toId} onChange={e => setToId(e.target.value)}>
              <option value="">— to —</option>
              {players.filter(p => p.id !== fromId).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <input
            className="input"
            placeholder="e.g. 2 trade goods, Support for the Throne"
            value={items}
            onChange={e => setItems(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLog()}
          />

          <button className="btn-primary py-2" disabled={!fromId || !toId || !items.trim()} onClick={handleLog}>
            <Plus size={14} className="inline mr-1" />Log Transaction
          </button>
        </div>

        {/* This round */}
        {roundTransactions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="label">This Round (R{round})</span>
            {roundTransactions.map(t => (
              <TransactionRow key={t.id} t={t} players={players} />
            ))}
          </div>
        )}

        {/* Full history */}
        <div className="flex flex-col gap-2">
          <span className="label">Full History ({allTransactions.length})</span>
          {allTransactions.length === 0 && (
            <p className="text-dim text-sm">No transactions logged yet.</p>
          )}
          {allTransactions.map(t => (
            <TransactionRow key={t.id} t={t} players={players} showRound />
          ))}
        </div>

        {/* Support for the Throne tracker */}
        <SupportTracker players={players} />
      </div>
    </div>
  )
}

function TransactionRow({ t, players, showRound }) {
  const from = players.find(p => p.id === t.fromId)
  const to = players.find(p => p.id === t.toId)
  return (
    <div className="panel-inset px-3 py-2 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-sm font-body">
        <span className="text-text font-semibold">{from?.name || '?'}</span>
        <ArrowRight size={10} className="text-dim" />
        <span className="text-text font-semibold">{to?.name || '?'}</span>
        {showRound && <span className="text-dim text-xs ml-auto">R{t.round}</span>}
      </div>
      <div className="text-dim text-xs">{t.items}</div>
    </div>
  )
}

function SupportTracker({ players }) {
  // Check each player's promissory notes for Support for the Throne
  return (
    <div className="panel p-4 flex flex-col gap-3">
      <span className="label">Support for the Throne</span>
      <p className="text-dim text-xs font-body">
        Track manually in each player's panel under Promissory Notes. Each held SftT = 1 VP while held.
      </p>
    </div>
  )
}
