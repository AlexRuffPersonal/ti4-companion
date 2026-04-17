const SPECIALTY_COLOUR = {
  green:  'text-success',
  blue:   'text-plasma',
  yellow: 'text-warning',
  red:    'text-danger',
}

// exhaustOptions: array of { id, planet_name, tech_specialty, coversColour }
// selected: array of planet IDs the player has toggled on
// onToggle: (planetId) => void
export default function ExhaustPlanetPicker({ exhaustOptions, selected, onToggle }) {
  if (!exhaustOptions || exhaustOptions.length === 0) return null

  return (
    <div className="mt-2">
      <p className="label text-xs mb-1">EXHAUST PLANET TO SKIP PREREQ</p>
      <div className="flex flex-col gap-1">
        {exhaustOptions.map(planet => {
          const isSelected = selected.includes(planet.id)
          return (
            <button
              key={planet.id}
              data-testid={`planet-option-${planet.id}`}
              onClick={() => onToggle(planet.id)}
              className={`flex items-center justify-between text-xs px-2 py-1 rounded border transition-all ${
                isSelected
                  ? 'border-warning bg-hull ring-1 ring-warning text-text'
                  : 'border-border bg-void text-dim hover:text-text'
              }`}
            >
              <span>{planet.planet_name}</span>
              <span className={SPECIALTY_COLOUR[planet.coversColour] ?? 'text-muted'}>
                {planet.coversColour}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
