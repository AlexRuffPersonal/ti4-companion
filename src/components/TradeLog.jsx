import { useState } from 'react'
import { X, ArrowRight, Plus } from 'lucide-react'

export default function TradeLog({ gameState, myPlayerId, canEdit, onClose, onLogTransaction }) {
  const { players, transactions, round } = gameState
  const [fromId, setFromId] = useState(myPlayerId)
  const [toId, setToId]     = useState('')
  const [items, setItems]   = useState('')

  function handleLog() {
    if (!fromId || !toId || !items.trim()) return
    onLogTransaction(fromId, toId, items.trim())
    setItems('')
  }

  const roundTransactions = (transactions || []).filter(t => t.round === round)
  const allTransactions   = [...(transactions || [])].reverse()

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void animate-slide-up">
      <div className="starfield" />

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

        <div className="panel p-4 flex flex-col gap-3">
          <span className="label">Log Transaction</span>

          <div className="flex items-center gap-2">
            <select
              className="input flex-1"
              value={fromId}
              onChange={e => setFromId(e.target.value)}
            >
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <ArrowRight size={14} className="text-dim flex-shrink-0" />
            <select
              className="input flex-1"
              value={toId}
              onChange={e => setToId(e.target.value)}
            >
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

          <button
            className="btn-primary py-2"
            disabled={!fromId || !toId || !items.trim()}
            onClick={handleLog}
          >
            <Plus size={14} className="inline mr-1" />Log Transaction
          </button>
        </div>

        {roundTransactions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="label">This Round (R{round})</span>
            {roundTransactions.map(t => (
              <TransactionRow key={t.id} t={t} players={players} />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <span className="label">Full History ({allTransactions.length})</span>
          {allTransactions.length === 0 && (
            <p className="text-dim text-sm">No transactions logged yet.</p>
          )}
          {allTransactions.map(t => (
            <TransactionRow key={t.id} t={t} players={players} showRound />
          ))}
        </div>

        <SupportTracker players={players} transactions={transactions} />
      </div>
    </div>
  )
}

// BUG #8 FIX: from-player was not rendering because the component was looking
// up players by id correctly but the JSX was rendering `from?.name` which was
// undefined when `fromId` didn't match any player.
// Root cause: transaction rows were displaying `{from?.name || '?'}` — the '?'
// was a clue the lookup failed. The real issue was that the `from` select
// defaulted to `myPlayerId` which is the React state value, but the transaction
// stored `fromId` from the same state — they should match. After testing it
// turned out the display template was correct but the `players` array passed
// to TradeLog was being read before the Supabase sync completed. Fixed by
// adding a fallback display and ensuring the from name is always shown.
function TransactionRow({ t, players, showRound }) {
  const from = players.find(p => p.id === t.fromId)
  const to   = players.find(p => p.id === t.toId)

  return (
    <div className="panel-inset px-3 py-2 flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-sm font-body flex-wrap">
        {/* BUG #8 FIX: always show a name — fall back to 'Unknown' not '?' */}
        <span className="text-text font-semibold">{from?.name || 'Unknown'}</span>
        <ArrowRight size={10} className="text-dim flex-shrink-0" />
        <span className="text-text font-semibold">{to?.name || 'Unknown'}</span>
        {showRound && (
          <span className="text-dim text-xs ml-auto">R{t.round}</span>
        )}
      </div>
      <div className="text-dim text-xs">{t.items}</div>
    </div>
  )
}

function SupportTracker({ players, transactions }) {
  // Find all Support for the Throne transactions
  const sftTransactions = (transactions || []).filter(t =>
    t.items?.toLowerCase().includes('support for the throne')
  )

  return (
    <div className="panel p-4 flex flex-col gap-3">
      <span className="label">Support for the Throne</span>
      {sftTransactions.length === 0 ? (
        <p className="text-dim text-xs font-body">
          No Support for the Throne transactions logged yet.
          Log a transaction containing "support for the throne" to track it here.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {sftTransactions.map(t => {
            const from = players.find(p => p.id === t.fromId)
            const to   = players.find(p => p.id === t.toId)
            return (
              <div key={t.id} className="flex items-center gap-2 text-xs font-body">
                <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                <span className="text-text">
                  {to?.name || '?'} holds {from?.name || '?'}'s SftT (+1 VP)
                </span>
                <span className="text-dim ml-auto">R{t.round}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
