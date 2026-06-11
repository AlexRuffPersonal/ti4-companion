// Props: { draftState, tileByNumber, currentPlayer, onPickSlice, pickError }
// Shows status bar: "Milty Draft — Slice Pick", whose turn indicator.
// Grid of N slice cards. Each card shows:
//   - Slice N · Score X.X
//   - Tile chips (tile_number, R/I or anomaly/wormhole labels)
//   - "Pick this slice" button (only on unclaimed slices when isMyTurn)
//   - "Claimed" label on claimed slices (greyed, opacity-50)
// pickError shown as text-danger below grid.
// Non-active pickers see grid read-only (no Pick buttons).

export default function DraftSlicePickView({ draftState, tileByNumber = {}, currentPlayer, onPickSlice, pickError }) {
  const slices = draftState?.slices ?? []
  const pickOrder = draftState?.pick_order ?? []
  const pickIndex = draftState?.pick_index ?? 0

  const activePlayerId = pickOrder[pickIndex] ?? null
  const isMyTurn = currentPlayer && activePlayerId === currentPlayer.id

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar */}
      <div className="flex items-center justify-between panel-inset">
        <span className="font-display text-bright text-sm tracking-widest">MILTY DRAFT — SLICE PICK</span>
        <span className="font-body text-muted text-sm">
          {isMyTurn ? 'Your turn to pick' : 'Waiting for another player'}
        </span>
      </div>

      {/* Slice grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {slices.map((slice, idx) => {
          const isClaimed = slice.claimed_by !== null
          return (
            <div
              key={slice.id}
              className={[
                'panel flex flex-col gap-2',
                isClaimed ? 'opacity-50' : '',
              ].join(' ')}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="font-body text-text text-sm font-semibold">
                  Slice {idx + 1}
                </span>
                <span className="font-mono text-muted text-xs">
                  {typeof slice.score === 'number' ? slice.score.toFixed(1) : slice.score}
                </span>
              </div>

              {/* Tile chips */}
              <div className="flex flex-col gap-1">
                {(slice.tiles ?? []).map((tileNumber) => {
                  const tile = tileByNumber[tileNumber]
                  let resourceTotal = 0
                  let influenceTotal = 0
                  if (tile?.planets && Array.isArray(tile.planets)) {
                    for (const planet of tile.planets) {
                      resourceTotal += planet.resources ?? 0
                      influenceTotal += planet.influence ?? 0
                    }
                  }
                  const isAnomaly = (tile?.anomalies?.length ?? 0) > 0 || tile?.type === 'anomaly'
                  const wormhole = tile?.wormholes?.[0] ?? null

                  return (
                    <div key={tileNumber} className="flex items-center gap-2 text-xs font-body">
                      <span className="font-display font-bold text-text w-6 text-right">{tileNumber}</span>
                      {isAnomaly ? (
                        <span className="text-warning">anomaly</span>
                      ) : (
                        <span className="text-muted">{resourceTotal}R/{influenceTotal}I</span>
                      )}
                      {wormhole && <span className="text-plasma">{wormhole}</span>}
                    </div>
                  )
                })}
              </div>

              {/* Status / Pick button */}
              {isClaimed ? (
                <span className="text-xs font-body text-muted mt-1">Claimed</span>
              ) : isMyTurn ? (
                <button
                  type="button"
                  className="btn-primary text-xs mt-1"
                  onClick={() => onPickSlice?.(slice.id)}
                >
                  Pick this slice
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Error */}
      {pickError && (
        <p className="text-danger text-sm font-body">{pickError}</p>
      )}
    </div>
  )
}
