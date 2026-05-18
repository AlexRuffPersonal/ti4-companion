# component-LobbyScreen (Phase 39)

**File:** `src/components/game/LobbyScreen.jsx`
**Status:** Modify
**Prereqs:** component-DraftPanel, hook-useDraft, client-edgeFunctions-p39

## Changes

```jsx
// 1. Extend tiles query to include planets, anomaly fields:
supabase.from('tiles').select('id, tile_number, wormhole, planets, anomaly, type, name')

// 2. Build tileDataById map alongside tileByNumber:
const tileDataById = {}
for (const t of data ?? []) {
  map[t.tile_number] = t      // tileByNumber (existing)
  tileDataById[t.id] = t      // new: keyed by id for HexMap
}

// 3. Add host state for draft setup method:
const [mapSetupMethod, setMapSetupMethod] = useState('string') // 'string' | 'draft'
const [draftMode, setDraftMode] = useState('official')          // 'official' | 'milty'
const [startDraftError, setStartDraftError] = useState(null)

// 4. Import startDraft from edgeFunctions.js

// 5. handleStartDraft():
//   setStartDraftError(null)
//   try: await startDraft(game.id, draftMode)
//   catch(e): setStartDraftError(e.message)

// 6. In host map config section:
//   When game.draft_state === null: show setup method toggle + existing string builder or draft mode UI
//   When game.draft_state !== null: show DraftPanel (all players)
//
// Setup method toggle (host only):
//   Two buttons: "Paste Map String" / "In-App Draft"
//   'draft' selected: show Official/Milty radio + Start Draft button + startDraftError
//
// DraftPanel (all players, when draft_state !== null):
//   <DraftPanel
//     draftState={game.draft_state}
//     tileByNumber={tileByNumber}
//     tileDataById={tileDataById}
//     currentPlayer={currentPlayer}
//     players={players}
//     game={game}
//     onPickSlice={draftPickSlice(game.id, sliceId)}
//     onPlaceTile={draftPlaceTile(game.id, ...)}
//   />
```

## Tests

```jsx
// tiles query extended to include planets, anomaly, type, name
// non-draft: host sees setup method toggle; 'Paste Map String' shows existing builder
// non-draft: host selects 'In-App Draft': shows mode selector and Start Draft button
// non-draft: non-host sees no draft controls
// Start Draft button calls startDraft(gameId, draftMode)
// startDraftError shown when start fails
// game.draft_state set: DraftPanel rendered for all players (host and non-host)
// game.draft_state null: DraftPanel not rendered
```
