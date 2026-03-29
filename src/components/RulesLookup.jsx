import { useState, useMemo } from 'react'
import { X, Search, BookOpen, AlertTriangle } from 'lucide-react'
import { RULES, AGENDAS } from '../data/gameData'

const TABS = ['rules', 'agendas']
const TAB_LABELS = { rules: 'Rules', agendas: 'Agendas' }

export default function RulesLookup({ onClose }) {
  const [tab, setTab] = useState('rules')
  const [query, setQuery] = useState('')

  const filteredRules = useMemo(() => {
    if (!query) return RULES
    const q = query.toLowerCase()
    return RULES.filter(r =>
      r.topic.toLowerCase().includes(q) || r.content.toLowerCase().includes(q)
    )
  }, [query])

  const filteredAgendas = useMemo(() => {
    if (!query) return AGENDAS
    const q = query.toLowerCase()
    return AGENDAS.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.outcome.toLowerCase().includes(q) ||
      (a.note || '').toLowerCase().includes(q)
    )
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void animate-slide-up">
      <div className="starfield" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-hull/80">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-plasma" />
          <span className="font-display text-sm text-bright tracking-wider">RULES REFERENCE</span>
        </div>
        <button className="text-dim hover:text-text transition-colors" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      {/* Search */}
      <div className="relative z-10 px-4 py-3 border-b border-border bg-hull/60">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            className="input pl-9"
            placeholder="Search rules, agendas…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="relative z-10 flex border-b border-border bg-hull/40">
        {TABS.map(t => (
          <button
            key={t}
            className={`flex-1 py-2.5 font-display text-xs tracking-widest transition-colors ${
              tab === t ? 'text-gold border-b-2 border-gold -mb-px' : 'text-dim hover:text-text'
            }`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 pb-8 flex flex-col gap-3">

        {/* TE gap warning */}
        <div className="flex items-start gap-2 panel-inset p-3">
          <AlertTriangle size={12} className="text-warning flex-shrink-0 mt-0.5" />
          <p className="text-dim text-xs font-body">
            No official LRR for Thunder's Edge (Mar 2026). Timing edge cases may be unresolved.
          </p>
        </div>

        {tab === 'rules' && (
          filteredRules.length === 0
            ? <p className="text-dim text-sm text-center py-8">No results for "{query}"</p>
            : filteredRules.map((rule, i) => (
              <div key={i} className="panel p-4 flex flex-col gap-2">
                <div className="font-display text-xs text-plasma tracking-wider">{rule.topic.toUpperCase()}</div>
                <p className="font-body text-sm text-text leading-relaxed">{rule.content}</p>
              </div>
            ))
        )}

        {tab === 'agendas' && (
          filteredAgendas.length === 0
            ? <p className="text-dim text-sm text-center py-8">No results for "{query}"</p>
            : filteredAgendas.map((agenda, i) => (
              <div key={i} className="panel p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-display px-1.5 py-0.5 rounded ${
                    agenda.type === 'law'
                      ? 'bg-gold/20 text-gold'
                      : 'bg-plasma/20 text-plasma'
                  }`}>
                    {agenda.type === 'law' ? 'LAW' : 'DIR'}
                  </span>
                  <span className="font-display text-sm font-bold text-bright">{agenda.name}</span>
                </div>
                <div className="font-body text-xs text-dim">{agenda.outcome}</div>
                {agenda.note && (
                  <p className="font-body text-xs text-text italic">{agenda.note}</p>
                )}
              </div>
            ))
        )}
      </div>
    </div>
  )
}
