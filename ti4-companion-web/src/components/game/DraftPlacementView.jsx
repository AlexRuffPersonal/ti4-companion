import { useState } from 'react'
import HexMap from './HexMap.jsx'
import DraftTileHand from './DraftTileHand.jsx'

// Props: { draftState, tileByNumber, tileDataById, currentPlayer, players, game,
//          onPlaceTile, placeError }
// Local state: selectedTile string|null
//
// Status bar: "Placement Phase — Turn N of M" + active player name + next player name
//
// Layout: flex row
//   Left: HexMap (reused) with:
//     mapTiles = { '0,0': mecatol, ...placed_tiles mapped to {tile_number, tile_id, rotation} }
//     onSelectSystem = handleHexClick (only fires when isMyTurn && selectedTile !== null)
//   Right panel (w-48):
//     Turn order: next 6 entries from placement_order[placement_index:+6]
//     Ring progress: count placed tiles per ring (ring1:6,ring2:12,ring3:12 for 6P)
//
// Bottom: DraftTileHand (currentPlayer's hand; active when isMyTurn)
// Hint text when tile selected: "click a valid hex to place it"
// placeError shown as text-danger
//
// handleHexClick(systemKey): if isMyTurn && selectedTile, call onPlaceTile(selectedTile, systemKey, 0); clear selectedTile

function axialRing(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))
}

export default function DraftPlacementView({ draftState, tileByNumber = {}, tileDataById = {}, currentPlayer, players = [], game, onPlaceTile, placeError }) {
  const [selectedTile, setSelectedTile] = useState(null)

  const placementOrder = draftState?.placement_order ?? []
  const placementIndex = draftState?.placement_index ?? 0
  const placedTiles = draftState?.placed_tiles ?? {}
  const hands = draftState?.hands ?? {}

  const activePlayerId = placementOrder[placementIndex] ?? null
  const isMyTurn = currentPlayer && activePlayerId === currentPlayer.id

  const totalTurns = placementOrder.length
  const currentTurn = placementIndex + 1

  // Build player name map
  const playerNameById = {}
  for (const p of players) {
    playerNameById[p.id] = p.display_name
  }

  const activePlayerName = playerNameById[activePlayerId] ?? activePlayerId ?? '—'
  const nextPlayerId = placementOrder[placementIndex + 1] ?? null
  const nextPlayerName = nextPlayerId ? (playerNameById[nextPlayerId] ?? nextPlayerId) : '—'

  // Build mapTiles for HexMap
  // Mecatol at 0,0
  const mecatolTile = tileByNumber['18']
  const mecatolId = mecatolTile?.id ?? null
  const mapTiles = {
    '0,0': { tile_number: '18', tile_id: mecatolId, rotation: 0 },
  }

  for (const [pos, placed] of Object.entries(placedTiles)) {
    const tile = tileByNumber[placed.tile_number]
    mapTiles[pos] = {
      tile_number: placed.tile_number,
      tile_id: tile?.id ?? null,
      rotation: placed.rotation ?? 0,
    }
  }

  // Count placed tiles per ring
  const ringCount = {}
  for (const pos of Object.keys(placedTiles)) {
    const parts = pos.split(',')
    const q = parseInt(parts[0], 10)
    const r = parseInt(parts[1], 10)
    if (!isNaN(q) && !isNaN(r)) {
      const ring = axialRing(q, r)
      ringCount[ring] = (ringCount[ring] ?? 0) + 1
    }
  }

  // Next 6 entries in placement order from current index
  const upcomingOrder = placementOrder.slice(placementIndex, placementIndex + 6)

  // Current player's hand
  const myHand = currentPlayer ? (hands[currentPlayer.id] ?? []) : []

  function handleHexClick(systemKey) {
    if (!isMyTurn || !selectedTile) return
    onPlaceTile?.(selectedTile, systemKey, 0)
    setSelectedTile(null)
  }

  function handleSelectTile(tileNumber) {
    setSelectedTile(prev => prev === tileNumber ? null : tileNumber)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Status bar */}
      <div className="panel-inset flex flex-wrap items-center gap-3">
        <span className="font-display text-bright text-sm tracking-widest">
          PLACEMENT PHASE — TURN {currentTurn} OF {totalTurns}
        </span>
        <span className="font-body text-text text-sm">
          Active: <span className="text-gold">{activePlayerName}</span>
        </span>
        {nextPlayerId && (
          <span className="font-body text-muted text-sm">
            Next: {nextPlayerName}
          </span>
        )}
      </div>

      {/* Main layout */}
      <div className="flex flex-row gap-3">
        {/* HexMap */}
        <div className="flex-1 min-h-[320px]">
          <HexMap
            mapTiles={mapTiles}
            tileData={tileDataById}
            activations={[]}
            systemUnits={[]}
            planetOwnership={{}}
            players={players}
            onSelectSystem={handleHexClick}
          />
        </div>

        {/* Right panel */}
        <div className="w-48 flex flex-col gap-3 flex-shrink-0">
          {/* Turn order */}
          <div className="panel flex flex-col gap-1">
            <span className="label text-xs">Up Next</span>
            {upcomingOrder.map((pid, idx) => (
              <div key={`${pid}-${idx}`} className="flex items-center gap-1">
                {idx === 0 && <span className="text-gold text-xs">→</span>}
                <span className={`font-body text-xs ${idx === 0 ? 'text-gold' : 'text-muted'}`}>
                  {playerNameById[pid] ?? pid}
                </span>
              </div>
            ))}
          </div>

          {/* Ring progress */}
          <div className="panel flex flex-col gap-1">
            <span className="label text-xs">Ring Progress</span>
            {[1, 2, 3].map(ring => (
              <div key={ring} className="flex items-center justify-between font-body text-xs">
                <span className="text-muted">Ring {ring}</span>
                <span className="text-text">{ringCount[ring] ?? 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hint */}
      {selectedTile && isMyTurn && (
        <p className="font-body text-muted text-xs text-center">click a valid hex to place it</p>
      )}

      {/* Error */}
      {placeError && (
        <p className="text-danger text-sm font-body">{placeError}</p>
      )}

      {/* Hand */}
      <DraftTileHand
        tiles={myHand}
        tileByNumber={tileByNumber}
        isMyTurn={isMyTurn}
        selectedTile={selectedTile}
        onSelect={handleSelectTile}
      />
    </div>
  )
}
