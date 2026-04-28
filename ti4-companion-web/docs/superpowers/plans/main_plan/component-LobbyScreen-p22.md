# component-LobbyScreen (Phase 22)

**File:** `src/components/game/LobbyScreen.jsx`
**Status:** Modify
**Prereqs:** lib-mapParser, component-MapPreviewSection, fn-game-update-settings-p22

## Changes

```jsx
// 1. On mount: fetch tiles reference table → build tileByNumber lookup
useEffect(() => {
  supabase.from('tiles').select('id, tile_number, wormhole')
    .then(({ data }) => {
      const map = {}
      for (const t of data ?? []) map[t.tile_number] = t
      setTileByNumber(map)
    })
}, [])

// 2. All players: render MapPreviewSection below the players list
<MapPreviewSection mapTiles={game.map_tiles} tileByNumber={tileByNumber} />

// 3. Host only: map configuration panel above MapPreviewSection
// State: mapPlayerCount (number, default players.length clamped 3–8),
//        selectedPreset (string|null), mapString (string), parseError (string|null)

// Player count selector: <select> 3–8; changing resets mapString and selectedPreset

// Preset dropdown:
//   PRESET_MAPS filtered to mapPlayerCount
//   PoK presets: disabled={!game.expansions?.pok} with title="Enable PoK expansion first"
//   On change: set mapString to preset.mapString; run parseMapString; update preview state

// Milty string textarea:
//   value={mapString}; onChange: run parseMapString; clear selectedPreset; update preview state
//   shows parseError inline below if present

// Save Map button:
//   disabled while parseError !== null or mapString is empty
//   onClick:
//     resolve tile_id for each parsed tile using tileByNumber
//     call updateGameSettings(game.id, {
//       map_tiles: { ...mecatolEntry, ...resolvedTiles },
//       map_layout: selectedPreset ?? `custom-${mapPlayerCount}`,
//     })
//     on error: show error message

// Warning: if game.map_layout includes 'pok' and !game.expansions?.pok:
//   show warning banner "Saved map contains PoK tiles — enable PoK or re-save"
```

## Tests

```js
// non-host: MapPreviewSection rendered; no player count selector / preset / textarea / save button
// host: all controls rendered
// PoK presets disabled when game.expansions.pok is false; enabled when true
// parse error shown inline; Save Map button disabled while error present
// valid string: Save Map enabled; clicking calls updateGameSettings with resolved map_tiles
// Realtime update to game.map_tiles causes MapPreviewSection to re-render with new tiles
// PoK warning banner shown when map_layout contains 'pok' and pok expansion off
```
