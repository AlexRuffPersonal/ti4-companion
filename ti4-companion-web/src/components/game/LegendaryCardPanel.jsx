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

export default function LegendaryCardPanel({ myCards }) {
  if (!myCards || myCards.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="label">Legendary Abilities</p>
      {myCards.map(card => (
        <div key={card.planet_name} className="panel-inset flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="label">{LEGENDARY_CARD_NAME[card.planet_name]}</p>
            <span className={`text-xs px-2 py-0.5 rounded ${card.status === 'exhausted' ? 'text-warning' : 'text-success'}`}>
              {card.status === 'exhausted' ? 'Exhausted' : 'Readied'}
            </span>
          </div>
          <p className="text-muted text-xs">{LEGENDARY_ABILITY_TEXT[card.planet_name]}</p>
        </div>
      ))}
    </div>
  )
}
