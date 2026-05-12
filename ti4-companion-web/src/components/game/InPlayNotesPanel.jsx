export default function InPlayNotesPanel({ inPlayNotes, players }) {
  if (!inPlayNotes || inPlayNotes.length === 0) return null

  return (
    <div className="panel w-full max-w-sm flex flex-col gap-4">
      <p className="label">Active Notes</p>
      {inPlayNotes.map(note => {
        const holder = players.find(p => p.id === note.held_by_player_id)
        const owner = players.find(p => p.id === note.origin_player_id)
        return (
          <div key={note.id} className="panel-inset text-xs font-body text-dim">
            <span className="text-bright">{note.name}</span>
            {' — held by '}
            <span>{holder?.faction}/{holder?.color}</span>
            {', from '}
            <span>{owner?.faction}/{owner?.color}</span>
          </div>
        )
      })}
    </div>
  )
}
