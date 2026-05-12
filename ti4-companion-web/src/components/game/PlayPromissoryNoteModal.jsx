import { useState } from 'react'

const PLAYER_PICKER_NOTES = ['Political Secret', 'Scepter Of Dominion', "Ragh's Call"]
const PLANET_PICKER_NOTES = ['Military Support', 'Terraform', 'Creuss IFF']

export default function PlayPromissoryNoteModal({ note, players, myPlanets, onPlay, onClose }) {
  const [chosenPlayerId, setChosenPlayerId] = useState(null)
  const [chosenDestinationPlanet, setChosenDestinationPlanet] = useState(null)
  const [error, setError] = useState(null)

  if (!note) return null

  const needsPlayer = PLAYER_PICKER_NOTES.includes(note.name)
  const needsPlanet = PLANET_PICKER_NOTES.includes(note.name)

  async function handlePlay() {
    setError(null)
    try {
      await onPlay(note.id, {
        ...(needsPlayer ? { chosenPlayerId } : {}),
        ...(needsPlanet ? { chosenDestinationPlanet } : {}),
      })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <p className="label">{note.name}</p>
        <p className="text-muted text-xs">{note.flavor_text}</p>

        {needsPlayer && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a player:</p>
            {players.map(p => (
              <button
                key={p.id}
                className={chosenPlayerId === p.id ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenPlayerId(p.id)}
              >
                {p.display_name}
              </button>
            ))}
          </div>
        )}

        {needsPlanet && (
          <div className="flex flex-col gap-2">
            <p className="text-dim text-xs font-body">Choose a planet:</p>
            {(myPlanets ?? []).map(p => (
              <button
                key={p.planet_name}
                className={chosenDestinationPlanet === p.planet_name ? 'btn-primary text-xs' : 'btn-ghost text-xs'}
                onClick={() => setChosenDestinationPlanet(p.planet_name)}
              >
                {p.planet_name}
              </button>
            ))}
          </div>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}

        <div className="flex gap-2">
          <button className="btn-primary text-xs" onClick={handlePlay}>PLAY</button>
          <button className="btn-ghost text-xs" onClick={onClose}>CANCEL</button>
        </div>
      </div>
    </div>
  )
}
