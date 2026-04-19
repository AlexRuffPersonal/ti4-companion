import { useState } from 'react'

export default function TokenRedistributionModal({ player, onSubmit }) {
  const base = player?.command_tokens ?? { tactic_total: 0, fleet: 0, strategy: 0 }
  const [tokens, setTokens] = useState({ ...base })

  const total = base.tactic_total + base.fleet + base.strategy

  function adjust(key, delta) {
    setTokens(prev => {
      const next = { ...prev, [key]: prev[key] + delta }
      if (next[key] < 0) return prev
      return next
    })
  }

  const fields = [
    { key: 'tactic_total', label: 'TACTIC' },
    { key: 'fleet',        label: 'FLEET' },
    { key: 'strategy',     label: 'STRATEGY' },
  ]

  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-sm flex flex-col gap-4">
        <p className="label">REDISTRIBUTE COMMAND TOKENS</p>
        <p className="text-dim text-xs font-body">
          Assign your {total} tokens across tactic, fleet, and strategy.
        </p>

        <div className="flex gap-4 justify-center">
          {fields.map(({ key, label }) => (
            <div key={key} className="text-center flex flex-col gap-1">
              <p className="label text-xs">{label}</p>
              <div className="flex items-center gap-1">
                <button className="counter-btn" onClick={() => adjust(key, -1)}>−</button>
                <input
                  type="text"
                  readOnly
                  value={tokens[key]}
                  aria-label={`${label.toLowerCase()} tokens`}
                  className="font-display text-bright text-lg w-6 text-center bg-transparent border-none outline-none"
                />
                <button className="counter-btn" onClick={() => adjust(key, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-dim text-xs">
            Total: <span className="text-bright font-display">{tokens.tactic_total + tokens.fleet + tokens.strategy}</span>
            {' '}/ {total}
          </span>
          <button
            className="btn-primary text-xs"
            onClick={() => onSubmit(tokens)}
          >
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  )
}