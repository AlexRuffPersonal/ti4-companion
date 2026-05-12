import { useState, useEffect } from 'react'

export default function ExplorationModal({
  planet,
  systemKey,
  traits = [],
  isFrontier,
  onExplorePlanet,
  onResolveCard,
  onExploreFrontier,
  onClose,
  hasMechOnPlanet = false,
}) {
  const [step, setStep] = useState(() => {
    if (isFrontier) return 'frontier'
    if (traits.length > 1) return 'pick_deck'
    return 'auto_draw'
  })
  const [drawnCard, setDrawnCard] = useState(null)
  const [frontierResult, setFrontierResult] = useState(null)

  useEffect(() => {
    if (step !== 'auto_draw') return
    if (!planet || traits.length !== 1) return
    const draw = async () => {
      const card = await onExplorePlanet(planet.planet_name, traits[0])
      setDrawnCard(card)
      setStep('confirm_card')
    }
    draw()
  }, [])

  useEffect(() => {
    if (step !== 'confirm_card' || !drawnCard) return
    if (drawnCard.has_choice) {
      setStep('pick_choice')
    } else if (drawnCard.is_conditional) {
      setStep('confirm_conditional')
    } else {
      onResolveCard(drawnCard.card_id, {})
      setStep('done')
    }
  }, [step, drawnCard])

  async function handlePickDeck(trait) {
    const card = await onExplorePlanet(planet.planet_name, trait)
    setDrawnCard(card)
    setStep('confirm_card')
  }

  async function handleExploreFrontier() {
    const result = await onExploreFrontier(systemKey)
    setFrontierResult(result)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">

        {step === 'frontier' && (
          <>
            <p className="label">FRONTIER TOKEN</p>
            <button className="btn-primary" onClick={handleExploreFrontier}>
              Explore Frontier Token
            </button>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
          </>
        )}

        {step === 'pick_deck' && (
          <>
            <p className="label">EXPLORATION</p>
            <p className="text-muted text-xs">Choose exploration deck</p>
            <div className="flex flex-col gap-2">
              {traits.map(trait => (
                <button
                  key={trait}
                  className="btn-primary capitalize"
                  onClick={() => handlePickDeck(trait)}
                >
                  {trait}
                </button>
              ))}
            </div>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
          </>
        )}

        {step === 'auto_draw' && (
          <p className="text-muted text-xs">Drawing card…</p>
        )}

        {step === 'confirm_card' && drawnCard && (
          <>
            <p className="label">{drawnCard.card_name}</p>
            <p className="text-muted text-xs">{drawnCard.card_text}</p>
          </>
        )}

        {step === 'pick_choice' && drawnCard && (
          <>
            <p className="label">{drawnCard.card_name}</p>
            <p className="text-muted text-xs">{drawnCard.card_text}</p>
            <p className="label">Choose an effect:</p>
            <div className="flex flex-col gap-2">
              <button
                className="btn-primary"
                onClick={() => { onResolveCard(drawnCard.card_id, { choice: 0 }); setStep('done') }}
              >
                {drawnCard.choice_a ?? 'Option A'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => { onResolveCard(drawnCard.card_id, { choice: 1 }); setStep('done') }}
              >
                {drawnCard.choice_b ?? 'Option B'}
              </button>
            </div>
          </>
        )}

        {step === 'confirm_conditional' && drawnCard && (
          <>
            <p className="label">{drawnCard.card_name}</p>
            <p className="text-muted text-xs">{drawnCard.card_text}</p>
            {hasMechOnPlanet ? (
              <>
                <p className="text-muted text-xs">You have a mech on this planet — effect applies automatically</p>
                <button
                  className="btn-primary"
                  onClick={() => { onResolveCard(drawnCard.card_id, {}); setStep('done') }}
                >
                  Gain Effect
                </button>
              </>
            ) : (
              <>
                <p className="label">Remove 1 infantry to gain the effect?</p>
                <div className="flex flex-col gap-2">
                  <button
                    className="btn-primary"
                    onClick={() => { onResolveCard(drawnCard.card_id, { remove_infantry: true }); setStep('done') }}
                  >
                    Remove Infantry &amp; Gain
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => { onResolveCard(drawnCard.card_id, { remove_infantry: false }); setStep('done') }}
                  >
                    Skip Effect
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 'done' && (
          <>
            <p className="text-muted text-xs">Exploration complete</p>
            <button className="btn-primary" onClick={onClose}>Close</button>
          </>
        )}

      </div>
    </div>
  )
}
