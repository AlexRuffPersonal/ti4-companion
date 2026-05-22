import { useState } from 'react'
import DraftSlicePickView from './DraftSlicePickView.jsx'
import DraftPlacementView from './DraftPlacementView.jsx'

// Props: { draftState, tileByNumber, tileDataById, currentPlayer, players, game,
//          onPickSlice, onPlaceTile }
// Local state: pickError string|null, placeError string|null
//
// Routes based on draftState.phase:
//   'slice-pick' → <DraftSlicePickView .../>
//   'placement'  → <DraftPlacementView .../>
//   otherwise    → null
//
// async handlePickSlice(sliceId): clear pickError, call onPickSlice, catch→setPickError
// async handlePlaceTile(tileNumber, position, rotation): clear placeError, call onPlaceTile, catch→setPlaceError

export default function DraftPanel({ draftState, tileByNumber, tileDataById, currentPlayer, players, game, onPickSlice, onPlaceTile }) {
  const [pickError, setPickError] = useState(null)
  const [placeError, setPlaceError] = useState(null)

  async function handlePickSlice(sliceId) {
    setPickError(null)
    try {
      await onPickSlice?.(sliceId)
    } catch (e) {
      setPickError(e.message)
    }
  }

  async function handlePlaceTile(tileNumber, position, rotation) {
    setPlaceError(null)
    try {
      await onPlaceTile?.(tileNumber, position, rotation)
    } catch (e) {
      setPlaceError(e.message)
    }
  }

  const phase = draftState?.phase

  if (phase === 'slice-pick') {
    return (
      <DraftSlicePickView
        draftState={draftState}
        tileByNumber={tileByNumber}
        currentPlayer={currentPlayer}
        onPickSlice={handlePickSlice}
        pickError={pickError}
      />
    )
  }

  if (phase === 'placement') {
    return (
      <DraftPlacementView
        draftState={draftState}
        tileByNumber={tileByNumber}
        tileDataById={tileDataById}
        currentPlayer={currentPlayer}
        players={players}
        game={game}
        onPlaceTile={handlePlaceTile}
        placeError={placeError}
      />
    )
  }

  return null
}
