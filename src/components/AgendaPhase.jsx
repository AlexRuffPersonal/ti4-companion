import { useState } from 'react'
import { X, Scale, BookOpen, AlertTriangle } from 'lucide-react'
import { AGENDAS } from '../data/gameData'

export default function AgendaPhase({
  gameState,
  myPlayerId,
  isHost,
  canEdit,
  onClose,
  onDrawAgenda,
  onCastVote,
  onResolveAgenda,
  onRepealLaw,
}) {
  const [showLaws, setShowLaws] = useState(false)
  const { players, agendaDeck, currentAgendas, agendaVotes, laws, custodiansClaimed } = gameState

  if (!custodiansClaimed) {
    return (
      <Modal onClose={onClose} title="Agenda Phase">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <Scale size={32} className="text-dim" />
          <p className="text-dim font-body text-sm">
            The Agenda Phase is locked until the Custodians Token is removed from Mecatol Rex.
          </p>
        </div>
      </Modal>
    )
  }

  const agendaCount = (currentAgendas || []).length

  return (
    <Modal onClose={onClose} title="Agenda Phase">
      <div className="flex flex-col gap-4">

        {/* Deck status */}
        <div className="panel-inset px-3 py-2 flex items-center justify-between">
          <span className="label">Deck remaining</span>
          <span className="font-display text-sm text-gold">{agendaDeck?.length || 0} cards</span>
        </div>

        {/* Draw button */}
        {agendaCount < 2 && isHost && (
          <button className="btn-primary py-3" onClick={onDrawAgenda}>
            Reveal Next Agenda ({agendaCount}/2 this round)
          </button>
        )}

        {/* Current agendas */}
        {(currentAgendas || []).map((agendaIndex, i) => {
          const agenda = AGENDAS[agendaIndex]
          if (!agenda) return null
          return (
            <AgendaCard
              key={i}
              index={i}
              agenda={agenda}
              players={players}
              agendaVotes={agendaVotes}
              myPlayerId={myPlayerId}
              isHost={isHost}
              canEdit={canEdit}
              laws={laws}
              onCastVote={(playerId, choice, votes) => onCastVote(playerId, i, choice, votes)}
              onResolve={(outcome) => onResolveAgenda(i, outcome, agenda.type === 'law')}
            />
          )
        })}

        {/* Laws in play */}
        <button
          className="w-full panel-inset px-3 py-2 flex items-center justify-between"
          onClick={() => setShowLaws(v => !v)}
        >
          <div className="flex items-center gap-2">
            <BookOpen size={12} className="text-gold" />
            <span className="label">Laws in Play ({laws?.length || 0})</span>
          </div>
          <span className="text-dim text-xs">{showLaws ? '▲' : '▼'}</span>
        </button>

        {showLaws && (
          <div className="panel p-3 flex flex-col gap-2 animate-slide-up">
            {(!laws || laws.length === 0) && (
              <span className="text-dim text-xs">No laws currently in play.</span>
            )}
            {(laws || []).map((law, i) => {
              const name = typeof law === 'string' ? law : law?.name
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-gold flex-shrink-0" />
                    <span className="font-body text-sm text-text">{name}</span>
                  </div>
                  {isHost && (
                    <button
                      className="text-danger text-xs hover:underline"
                      onClick={() => onRepealLaw(law)}
                    >
                      Repeal
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* TE timing gap warning */}
        <div className="flex items-start gap-2 panel-inset p-3">
          <AlertTriangle size={12} className="text-warning flex-shrink-0 mt-0.5" />
          <p className="text-dim text-xs font-body">
            ⚠️ No official LRR for Thunder's Edge yet (Mar 2026). Complex agenda interactions may have unresolved edge cases.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function AgendaCard({ index, agenda, players, agendaVotes, myPlayerId, isHost, canEdit, laws, onCastVote, onResolve }) {
  const [myVotes, setMyVotes] = useState(0)
  const [myChoice, setMyChoice] = useState(null)

  const isLaw = agenda.type === 'law'
  const choices = agenda.outcome.includes('/') ? agenda.outcome.split(' / ') : [agenda.outcome]
  const isForAgainst = choices.length === 2 && choices[0] === 'For'

  // Tally votes
  const tally = {}
  Object.entries(agendaVotes || {}).forEach(([key, v]) => {
    if (!key.startsWith(`${index}-`)) return
    tally[v.choice] = (tally[v.choice] || 0) + (v.votes || 0)
  })

  const myVoteKey = `${index}-${myPlayerId}`
  const myCurrentVote = agendaVotes?.[myVoteKey]

  return (
    <div className={`panel p-4 flex flex-col gap-3 ${isLaw ? 'border-gold/30' : 'border-border'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-display px-1.5 py-0.5 rounded ${isLaw ? 'bg-gold/20 text-gold' : 'bg-plasma/20 text-plasma'}`}>
              {isLaw ? 'LAW' : 'DIRECTIVE'}
            </span>
            {isLaw && <span className="text-gold text-xs">Permanent if enacted</span>}
          </div>
          <h3 className="font-display text-sm font-bold text-bright mt-1">{agenda.name}</h3>
          <p className="text-dim text-xs font-body mt-0.5">{agenda.outcome}</p>
          {agenda.note && <p className="text-text text-xs font-body mt-1 italic">{agenda.note}</p>}
        </div>
      </div>

      {/* Vote totals */}
      <div className="flex flex-col gap-1">
        <span className="label">Vote Totals</span>
        <div className="flex gap-2 flex-wrap">
          {choices.map(choice => (
            <div key={choice} className="flex items-center gap-2 panel-inset px-2 py-1 rounded">
              <span className="font-body text-xs text-dim">{choice}:</span>
              <span className="font-display text-sm font-bold text-gold">{tally[choice] || 0}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 panel-inset px-2 py-1 rounded">
            <span className="font-body text-xs text-dim">Abstain:</span>
            <span className="font-display text-sm font-bold text-dim">
              {players.filter(p => {
                const v = agendaVotes?.[`${index}-${p.id}`]
                return v && v.choice === 'abstain'
              }).length}
            </span>
          </div>
        </div>
      </div>

      {/* Per-player votes */}
      <div className="flex flex-col gap-1">
        <span className="label">Players</span>
        {players.map(p => {
          const voteKey = `${index}-${p.id}`
          const pVote = agendaVotes?.[voteKey]
          return (
            <div key={p.id} className="flex items-center justify-between text-xs font-body">
              <span className={`text-text ${p.id === myPlayerId ? 'font-semibold' : ''}`}>{p.name}</span>
              {pVote
                ? <span className="text-gold">{pVote.choice} ({pVote.votes} votes)</span>
                : <span className="text-dim italic">not yet voted</span>
              }
            </div>
          )
        })}
      </div>

      {/* My vote input */}
      {canEdit(myPlayerId) && !myCurrentVote && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <span className="label">Cast Your Vote</span>
          <div className="flex gap-2 flex-wrap">
            {choices.map(choice => (
              <button
                key={choice}
                className={`text-xs px-3 py-1.5 rounded border font-body transition-colors ${
                  myChoice === choice ? 'border-gold text-gold bg-gold/10' : 'border-muted text-dim hover:border-dim'
                }`}
                onClick={() => setMyChoice(choice)}
              >
                {choice}
              </button>
            ))}
            <button
              className={`text-xs px-3 py-1.5 rounded border font-body transition-colors ${
                myChoice === 'abstain' ? 'border-dim text-dim bg-muted/20' : 'border-muted text-dim hover:border-dim'
              }`}
              onClick={() => setMyChoice('abstain')}
            >
              Abstain
            </button>
          </div>
          {myChoice && myChoice !== 'abstain' && (
            <div className="flex items-center gap-2">
              <span className="text-dim text-xs">Votes (influence):</span>
              <input
                type="number"
                min={0}
                max={99}
                className="input w-20 text-center"
                value={myVotes}
                onChange={e => setMyVotes(parseInt(e.target.value) || 0)}
              />
            </div>
          )}
          {myChoice && (
            <button
              className="btn-primary py-2 text-xs"
              onClick={() => onCastVote(myPlayerId, myChoice, myChoice === 'abstain' ? 0 : myVotes)}
            >
              Confirm Vote
            </button>
          )}
        </div>
      )}

      {/* Resolve (host only) */}
      {isHost && (
        <div className="border-t border-border pt-3 flex flex-col gap-2">
          <span className="label">Resolve Agenda</span>
          <div className="flex gap-2 flex-wrap">
            {choices.map(choice => (
              <button
                key={choice}
                className="btn-primary text-xs py-1.5 px-3"
                onClick={() => onResolve(choice)}
              >
                Resolve: {choice}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({ onClose, title, children }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void animate-slide-up">
      <div className="starfield" />
      <header className="relative z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-hull/80">
        <div className="flex items-center gap-2">
          <Scale size={14} className="text-plasma" />
          <span className="font-display text-sm text-bright tracking-wider">{title.toUpperCase()}</span>
        </div>
        <button className="text-dim hover:text-text transition-colors" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 pb-8">
        {children}
      </div>
    </div>
  )
}
