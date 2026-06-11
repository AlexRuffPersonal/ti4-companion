// Props: { tiles: string[], tileByNumber: Record<string,TileRef>, isMyTurn: boolean,
//          selectedTile: string|null, onSelect: (tileNumber:string)=>void }
// Renders a horizontal scrolling strip of tile chips.
// Each chip shows: tile_number (large), total R/I or anomaly label, wormhole indicator.
// Selected tile gets border-plasma + bg-hull ring.
// Chips are disabled (opacity-50, pointer-events-none) when !isMyTurn.
// Empty hand shows "Hand empty" placeholder.

export default function DraftTileHand({ tiles = [], tileByNumber = {}, isMyTurn = false, selectedTile = null, onSelect }) {
  if (tiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-muted font-body text-sm">
        Hand empty
      </div>
    )
  }

  return (
    <div className="flex flex-row gap-2 overflow-x-auto py-2 px-1">
      {tiles.map((tileNumber) => {
        const tile = tileByNumber[tileNumber]
        const isSelected = selectedTile === tileNumber

        // Compute display info
        let resourceTotal = 0
        let influenceTotal = 0
        const hasAnomalyPlanets = (tile?.anomalies?.length ?? 0) > 0
        const wormhole = tile?.wormholes?.[0] ?? null

        if (tile?.planets && Array.isArray(tile.planets)) {
          for (const planet of tile.planets) {
            resourceTotal += planet.resources ?? 0
            influenceTotal += planet.influence ?? 0
          }
        }

        const isAnomaly = hasAnomalyPlanets || tile?.type === 'anomaly'

        return (
          <button
            key={tileNumber}
            type="button"
            onClick={() => onSelect?.(tileNumber)}
            className={[
              'flex flex-col items-center justify-center gap-1 rounded border-2 px-3 py-2 min-w-[64px] flex-shrink-0 transition-all font-body',
              isSelected
                ? 'border-plasma bg-hull text-bright'
                : 'border-border bg-panel text-text hover:border-dim',
              !isMyTurn ? 'opacity-50 pointer-events-none' : 'cursor-pointer',
            ].join(' ')}
            aria-pressed={isSelected}
            aria-disabled={!isMyTurn}
          >
            <span className="text-lg font-display font-bold leading-none">{tileNumber}</span>
            {isAnomaly ? (
              <span className="text-xs text-warning">anomaly</span>
            ) : (
              <span className="text-xs text-muted">
                {resourceTotal}R / {influenceTotal}I
              </span>
            )}
            {wormhole && (
              <span className="text-xs text-plasma">{wormhole}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
