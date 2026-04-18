import { useState, useEffect } from 'react'

export default function AbilityNotificationBar({ triggerable, onPlay }) {
  const [dismissed, setDismissed] = useState(new Set())

  // Reset dismissed set when triggerable changes (new event window)
  useEffect(() => {
    setDismissed(new Set())
  }, [triggerable])

  const visible = (triggerable ?? []).filter(a => !dismissed.has(a.id))

  if (!visible.length) return null

  return (
    <div className="flex flex-col gap-2 px-4 py-2">
      {visible.map(ability => (
        <div key={ability.id} className="panel-inset flex items-center justify-between gap-3">
          <span className="text-warning font-display text-xs tracking-widest">
            ⚡ {ability.ability_name.toUpperCase()} PLAYABLE
          </span>
          <div className="flex gap-2">
            <button className="btn-primary text-xs" onClick={() => onPlay(ability)}>
              PLAY
            </button>
            <button
              className="btn-ghost text-xs"
              onClick={() => setDismissed(prev => new Set([...prev, ability.id]))}
            >
              DISMISS
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
