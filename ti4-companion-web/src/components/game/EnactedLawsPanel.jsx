import { useState } from 'react'

export default function EnactedLawsPanel({ laws = [] }) {
  const [open, setOpen] = useState(false)
  if (laws.length === 0) return null

  const activeCount = laws.filter(l => !l.is_repealed).length

  return (
    <div className="panel flex flex-col gap-2">
      <button
        className="flex items-center justify-between w-full"
        onClick={() => setOpen(o => !o)}
      >
        <p className="label">ENACTED LAWS</p>
        <span className="text-muted text-xs">{activeCount} active {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {laws.map(law => (
            <div key={law.id} className="panel-inset flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <p className={`text-xs font-display ${law.is_repealed ? 'line-through text-dim' : 'text-text'}`}>
                  {law.agendas?.name}
                </p>
                {law.host_applies_manually && !law.is_repealed && (
                  <span className="text-warning text-xs">MANUAL</span>
                )}
              </div>
              {law.elected_target && (
                <p className="text-xs text-muted">{law.elected_target}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
