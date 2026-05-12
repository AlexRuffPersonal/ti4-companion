import { useState } from 'react'

const LEGENDARY_ABILITY_TEXT = {
  primor:    'Exhaust at end of your turn: place up to 2 infantry from reinforcements on any planet you control.',
  hopes_end: 'Exhaust at end of your turn: place 1 mech on any planet you control, or draw 1 action card.',
  mallice:   'Exhaust at end of your turn: gain 2 trade goods, or convert all commodities to trade goods.',
  mirage:    'Exhaust at end of your turn: place up to 2 fighters in any system containing your ships.',
}

const LEGENDARY_CARD_NAME = {
  primor:    'The Atrament',
  hopes_end: 'Imperial Arms Vault',
  mallice:   'Exterrix Headquarters',
  mirage:    'Mirage Flight Academy',
}

export default function EndTurnDialog({ myCards, exhaustCard, onConfirmEndTurn, onClose }) {
  const [inFlight, setInFlight] = useState(null)

  const readiedCards = (myCards ?? []).filter(c => c.status === 'readied')

  if (readiedCards.length === 0) return null

  async function handleUse(planetName) {
    setInFlight(planetName)
    try {
      await exhaustCard(planetName)
    } finally {
      setInFlight(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <p className="label">End of Turn — Legendary Abilities</p>
        <p className="text-muted text-xs">You may exhaust any of these cards before ending your turn.</p>
        {readiedCards.map(card => (
          <div key={card.planet_name} className="panel-inset flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <p className="label">{LEGENDARY_CARD_NAME[card.planet_name]}</p>
              <p className="text-muted text-xs">{LEGENDARY_ABILITY_TEXT[card.planet_name]}</p>
            </div>
            <button
              className="btn-primary self-start text-xs"
              disabled={inFlight !== null}
              onClick={() => handleUse(card.planet_name)}
            >
              Use
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={onConfirmEndTurn}>
            Skip &amp; End Turn
          </button>
          <button className="btn-primary" onClick={onConfirmEndTurn}>
            Done, End Turn
          </button>
        </div>
      </div>
    </div>
  )
}
