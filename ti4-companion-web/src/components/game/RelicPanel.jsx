const ACTION_RELICS = new Set([
  'Dominus Orb',
  'Maw Of Worlds',
  'Stellar Converter',
  'The Codex',
  'Enigmatic Device',
])

export default function RelicPanel({ relics, isActivePlayer, onUseRelic }) {
  if (!relics || relics.length === 0) return null

  return (
    <div className="panel w-full max-w-sm flex flex-col gap-4">
      <p className="label">RELICS</p>
      <div className="flex flex-col gap-3">
        {relics.map(relic => {
          const name = relic.name ?? relic.relics?.name
          const text = relic.text ?? relic.relics?.text
          const isAction = ACTION_RELICS.has(name)
          const isPurged = relic.state === 'purged'
          const isExhausted = relic.exhausted || isPurged
          const canAct = !isExhausted && !isPurged

          return (
            <div key={relic.id} className="flex flex-col gap-1">
              <span className={`font-body text-sm ${!isExhausted ? 'text-bright font-bold' : 'text-dim'}`}>
                {name}
              </span>
              {text && <p className="text-muted text-xs">{text}</p>}
              {relic.exhaustable && (
                <span className={`text-xs px-2 py-0.5 rounded self-start ${isPurged ? 'text-danger' : isExhausted ? 'text-warning' : 'text-success'}`}>
                  {isPurged ? 'Purged' : isExhausted ? 'Exhausted' : 'Ready'}
                </span>
              )}
              {isAction && (
                <button
                  className="btn-primary self-start text-xs"
                  disabled={!isActivePlayer || isExhausted}
                  onClick={() => onUseRelic(relic.id)}
                >
                  Use (Action)
                </button>
              )}
              {!isAction && relic.exhaustable && !relic.purge_on_use && (
                <button
                  className="btn-ghost self-start text-xs"
                  disabled={isExhausted}
                  onClick={() => onUseRelic(relic.id)}
                >
                  Use
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
