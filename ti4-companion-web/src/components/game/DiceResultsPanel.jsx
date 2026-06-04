import GameIcon from '../shared/GameIcon.jsx'

export default function DiceResultsPanel({ dice, label }) {
  if (!dice || dice.length === 0) return null

  const hits = dice.filter(d => d.hit).length

  const grouped = dice.reduce((acc, d) => {
    if (!acc[d.unit_type]) acc[d.unit_type] = []
    acc[d.unit_type].push(d)
    return acc
  }, {})

  return (
    <div className="panel-inset p-2 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="label text-xs">{label} Dice</span>
        <span className="font-display text-xs text-bright">{hits} hit{hits !== 1 ? 's' : ''}</span>
      </div>
      {Object.entries(grouped).map(([unitType, results]) => (
        <div key={unitType} className="flex flex-col gap-1">
          <span className="text-muted text-xs capitalize">{unitType}</span>
          <div className="flex flex-wrap gap-1">
            {results.map((d, i) => (
              <span
                key={i}
                className={`w-7 h-7 flex items-center justify-center rounded font-mono text-xs font-bold border ${
                  d.hit ? 'border-success text-success bg-success/10' : 'border-border text-dim bg-void'
                }`}
                title={d.roll}
              >
                <GameIcon category="dice" name={d.hit ? 'hit' : 'miss'} size={14} alt={d.hit ? 'hit' : 'miss'} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}