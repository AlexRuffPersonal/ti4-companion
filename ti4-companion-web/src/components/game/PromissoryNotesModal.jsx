import { useState } from 'react'
import PlayPromissoryNoteModal from './PlayPromissoryNoteModal.jsx'

function resolveText(text, originPlayerId, players) {
  const originPlayer = players?.find(p => p.id === originPlayerId)
  return text?.replace('{{owner}}', originPlayer?.display_name || 'Unknown') || ''
}

export default function PromissoryNotesModal({ notes, players, myPlanets, currentPlayerId, onGive, onPlay, onClose }) {
  const [pendingNote, setPendingNote] = useState(null)

  return (
    <div className="fixed inset-0 bg-void/90 flex items-center justify-center z-50 p-4">
      <div className="panel w-full max-w-md flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="label">MY PROMISSORY NOTES</p>
          <button className="btn-ghost text-xs" onClick={onClose}>CLOSE</button>
        </div>

        {!pendingNote && (notes.length === 0 ? (
          <p className="text-dim text-sm font-body">No promissory notes held.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {notes.map(n => {
              const ref = n.promissory_notes
              const text = resolveText(ref?.text, n.origin_player_id, players)
              const needsSubModal = ref?.name === 'Terraform'
              return (
                <div key={n.id} className="panel-inset flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1 flex-1">
                    <span className="text-bright text-sm font-body">{ref?.name}</span>
                    <span className="text-dim text-xs font-body">{text}</span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button className="btn-ghost text-xs" onClick={() => onGive(n)}>
                      GIVE
                    </button>
                    <button
                      className="btn-primary text-xs"
                      onClick={() => needsSubModal ? setPendingNote(n) : onPlay(n.id)}
                    >
                      PLAY
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {pendingNote && (
        <PlayPromissoryNoteModal
          note={pendingNote.promissory_notes}
          players={players}
          myPlanets={myPlanets}
          onPlay={(_noteId, selections) => {
            onPlay(pendingNote.id, selections?.chosenDestinationPlanet)
            setPendingNote(null)
          }}
          onClose={() => setPendingNote(null)}
        />
      )}
    </div>
  )
}
