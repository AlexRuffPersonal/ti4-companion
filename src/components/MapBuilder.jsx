import { useState, useMemo, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronDown, Trash2, X } from 'lucide-react'
import { TILES, getTileById, getTilesByExpansion, getTileResources, getTileInfluence, ANOMALY_LABELS, WORMHOLE_LABELS } from '../data/tiles'
import { MAP_LAYOUTS, getLayoutById } from '../data/mapLayouts'

// ── Auto-fill ─────────────────────────────────────────────────────────────────
// Returns a base tile map derived purely from the current game state:
//   • Mecatol Rex (tile 18) at position (0,0)
//   • Each player's home system tile at their seat's home position
// These auto-tiles are used as a background layer; manually placed tiles in
// mapTiles always take precedence (and can override auto-fills if desired).

function computeAutoTiles(gameState, layout) {
  const auto = {}

  // Mecatol Rex at centre
  if (layout.positions.some(p => p.q === 0 && p.r === 0)) {
    auto['0,0'] = 18
  }

  // Home systems keyed by faction name → tile id
  const homeTileByFaction = {}
  for (const tile of TILES) {
    if (tile.type === 'home' && tile.homeFor) homeTileByFaction[tile.homeFor] = tile.id
  }

  for (const { q, r, isHome, seatIndex } of layout.positions) {
    if (!isHome || seatIndex == null) continue
    const player = (gameState.players ?? [])[seatIndex]
    if (!player?.faction) continue
    const tileId = homeTileByFaction[player.faction]
    if (tileId) auto[`${q},${r}`] = tileId
  }

  return auto
}

// ── Constants ────────────────────────────────────────────────────────────────

const HEX_SIZE = 38 // px, pointy-top radius

const TILE_COLORS = {
  mecatol:      '#78350f',
  blue:         '#1e3a5f',
  red:          '#3f1a1a',
  home:         '#1a1a2e',
  hyperlane:    '#1a2e1a',
  frontier:     '#1e1e2e',
  entropic_scar:'#2e1a2e',
}

const ANOMALY_COLORS = {
  asteroid_field: '#2a2a1a',
  supernova:      '#3f2000',
  nebula:         '#1a1a3f',
  gravity_rift:   '#2a1a3f',
  entropic_scar:  '#2e1a2e',
}

const WORMHOLE_COLORS = {
  alpha: '#06b6d4',  // plasma
  beta:  '#10b981',  // success
  delta: '#f59e0b',  // gold
  gamma: '#a855f7',  // purple
}

const EXPANSION_LABELS = { base: 'Base', pok: 'PoK', te: "TE" }
const TYPE_LABELS = {
  blue:      'Blue',
  red:       'Red',
  home:      'Home',
  mecatol:   'Mecatol',
  hyperlane: 'Hyperlane',
  frontier:  'Frontier',
}

// ── Hex Math ─────────────────────────────────────────────────────────────────

function hexToPixel(q, r, size) {
  return {
    x: size * Math.sqrt(3) * (q + r / 2),
    y: size * 1.5 * r,
  }
}

function hexCorners(cx, cy, size) {
  return Array.from({ length: 6 }, (_, i) => {
    const angleDeg = 60 * i - 30
    const rad = (Math.PI / 180) * angleDeg
    return [cx + size * Math.cos(rad), cy + size * Math.sin(rad)]
  })
}

function cornersToPath(corners) {
  return corners.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ') + ' Z'
}

function computeViewBox(positions, size, padding = 8) {
  const pts = positions.map(({ q, r }) => hexToPixel(q, r, size))
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const minX = Math.min(...xs) - size - padding
  const maxX = Math.max(...xs) + size + padding
  const minY = Math.min(...ys) - size - padding
  const maxY = Math.max(...ys) + size + padding
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

// ── HexCell ───────────────────────────────────────────────────────────────────

function HexCell({ q, r, size, tile, isHome, seatIndex, isSelected, onClick }) {
  const { x, y } = hexToPixel(q, r, size)
  const corners = hexCorners(x, y, size)
  const path = cornersToPath(corners)

  let fillColor = '#0d1117' // hull (empty)
  if (tile) {
    if (tile.anomaly && ANOMALY_COLORS[tile.anomaly]) {
      fillColor = ANOMALY_COLORS[tile.anomaly]
    } else if (tile.type === 'mecatol') {
      fillColor = TILE_COLORS.mecatol
    } else if (tile.type === 'home') {
      fillColor = TILE_COLORS.home
    } else if (tile.type === 'hyperlane') {
      fillColor = TILE_COLORS.hyperlane
    } else if (tile.type === 'blue') {
      fillColor = TILE_COLORS.blue
    } else if (tile.type === 'red') {
      fillColor = TILE_COLORS.red
    }
  } else if (isHome) {
    fillColor = '#111827' // panel, empty home
  }

  const strokeColor = isSelected ? '#f59e0b' : '#1f2937'
  const strokeWidth = isSelected ? 2 : 1

  const fontSize = size * 0.22
  const smallFont = size * 0.18

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <path d={path} fill={fillColor} stroke={strokeColor} strokeWidth={strokeWidth} />
      {tile ? (
        <>
          {/* Tile number */}
          <text
            x={x} y={y - size * 0.6}
            textAnchor="middle" dominantBaseline="middle"
            fill="#6b7280" fontSize={smallFont}
            fontFamily="'Space Mono', monospace"
          >
            {tile.id}
          </text>

          {/* Planet names + R/I */}
          {tile.planets.slice(0, 3).map((planet, i) => {
            const offsetY = tile.planets.length === 1 ? 0
              : tile.planets.length === 2 ? (i - 0.5) * size * 0.38
              : (i - 1) * size * 0.3
            const label = planet.name.length > 9
              ? planet.name.slice(0, 8) + '…'
              : planet.name
            return (
              <g key={i}>
                <text
                  x={x} y={y + offsetY - size * 0.05}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={planet.legendary ? '#f59e0b' : '#e5e7eb'}
                  fontSize={fontSize}
                  fontFamily="'Rajdhani', sans-serif"
                  fontWeight="600"
                >
                  {label}
                </text>
                <text
                  x={x} y={y + offsetY + size * 0.2}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="#9ca3af" fontSize={smallFont}
                  fontFamily="'Space Mono', monospace"
                >
                  {planet.resources}/{planet.influence}
                </text>
              </g>
            )
          })}

          {/* Wormhole indicator */}
          {tile.wormhole && (
            <text
              x={x + size * 0.65} y={y - size * 0.55}
              textAnchor="middle" dominantBaseline="middle"
              fill={WORMHOLE_COLORS[tile.wormhole] ?? '#fff'}
              fontSize={size * 0.28}
              fontFamily="serif"
            >
              {WORMHOLE_LABELS[tile.wormhole]}
            </text>
          )}

          {/* Anomaly badge */}
          {tile.anomaly && ANOMALY_LABELS[tile.anomaly] && (
            <text
              x={x - size * 0.62} y={y - size * 0.55}
              textAnchor="middle" dominantBaseline="middle"
              fill="#d1d5db" fontSize={size * 0.19}
              fontFamily="'Orbitron', sans-serif"
            >
              {ANOMALY_LABELS[tile.anomaly]}
            </text>
          )}
        </>
      ) : isHome ? (
        <text
          x={x} y={y}
          textAnchor="middle" dominantBaseline="middle"
          fill="#4b5563" fontSize={size * 0.28}
          fontFamily="'Orbitron', sans-serif"
        >
          {seatIndex != null ? seatIndex + 1 : '?'}
        </text>
      ) : (
        <text
          x={x} y={y}
          textAnchor="middle" dominantBaseline="middle"
          fill="#374151" fontSize={size * 0.22}
          fontFamily="'Orbitron', sans-serif"
        >
          +
        </text>
      )}

      {/* Selected ring */}
      {isSelected && (
        <path d={path} fill="none" stroke="#f59e0b" strokeWidth={2.5} opacity={0.7} />
      )}
    </g>
  )
}

// ── TileMini (palette card) ───────────────────────────────────────────────────

function TileMini({ tile, isPlaced, onClick }) {
  const s = 22 // mini hex size
  const corners = hexCorners(s + 2, s + 4, s)
  const path = cornersToPath(corners)

  let fill = TILE_COLORS[tile.type] ?? '#1e3a5f'
  if (tile.anomaly && ANOMALY_COLORS[tile.anomaly]) fill = ANOMALY_COLORS[tile.anomaly]

  const totalR = getTileResources(tile)
  const totalI = getTileInfluence(tile)

  return (
    <button
      onClick={onClick}
      disabled={isPlaced}
      className={`flex flex-col items-center gap-1 px-2 py-2 rounded border transition-colors flex-shrink-0 w-16 ${
        isPlaced
          ? 'border-border opacity-40 cursor-not-allowed'
          : 'border-border hover:border-gold cursor-pointer'
      }`}
      style={{ background: 'transparent' }}
    >
      <svg width={s * 2 + 4} height={s * 2 + 8} viewBox={`0 0 ${s * 2 + 4} ${s * 2 + 8}`}>
        <path d={path} fill={fill} stroke="#374151" strokeWidth={1} />
        {tile.wormhole && (
          <text x={s + 2} y={s * 0.6 + 4} textAnchor="middle" dominantBaseline="middle"
            fill={WORMHOLE_COLORS[tile.wormhole]} fontSize={s * 0.55} fontFamily="serif">
            {WORMHOLE_LABELS[tile.wormhole]}
          </text>
        )}
      </svg>
      <span className="font-mono text-xs text-dim">{tile.id}</span>
      <span className="font-body text-xs text-text leading-tight text-center" style={{ fontSize: '10px' }}>
        {tile.planets.length === 0
          ? (tile.anomaly ? ANOMALY_LABELS[tile.anomaly] : '—')
          : tile.planets.map(p => p.name).join(', ').slice(0, 14)
        }
      </span>
      {tile.planets.length > 0 && (
        <span className="font-mono text-xs" style={{ fontSize: '10px' }}>
          <span className="text-gold">{totalR}R</span>
          <span className="text-dim">/</span>
          <span className="text-plasma">{totalI}I</span>
        </span>
      )}
    </button>
  )
}

// ── Layout Picker Modal ───────────────────────────────────────────────────────

function LayoutPicker({ currentId, onSelect, onClose }) {
  const official = MAP_LAYOUTS.filter(l => l.source === 'official')
  const community = MAP_LAYOUTS.filter(l => l.source === 'community')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-hull border border-border rounded-lg w-full max-w-sm mx-4 max-h-[70vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-display text-sm tracking-widest text-gold">SELECT LAYOUT</span>
          <button onClick={onClose} className="text-dim hover:text-text">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <LayoutGroup title="Official" layouts={official} currentId={currentId} onSelect={onSelect} />
          <LayoutGroup title="Community" layouts={community} currentId={currentId} onSelect={onSelect} />
        </div>
      </div>
    </div>
  )
}

function LayoutGroup({ title, layouts, currentId, onSelect }) {
  const byCount = {}
  for (const l of layouts) {
    if (!byCount[l.playerCount]) byCount[l.playerCount] = []
    byCount[l.playerCount].push(l)
  }

  return (
    <div>
      <div className="font-display text-xs tracking-widest text-dim mb-2">{title.toUpperCase()}</div>
      <div className="space-y-1">
        {Object.keys(byCount).sort((a, b) => a - b).map(count => (
          byCount[count].map(layout => (
            <button
              key={layout.id}
              onClick={() => onSelect(layout.id)}
              className={`w-full text-left px-3 py-2 rounded border transition-colors ${
                layout.id === currentId
                  ? 'border-gold bg-gold/10 text-gold'
                  : 'border-border hover:border-gold/50 text-text'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-body text-sm">{layout.name}</span>
                <span className="font-display text-xs text-dim">{layout.playerCount}P</span>
              </div>
              <div className="font-body text-xs text-dim mt-0.5">{layout.description}</div>
            </button>
          ))
        ))}
      </div>
    </div>
  )
}

// ── MapStats ──────────────────────────────────────────────────────────────────

function MapStats({ mapTiles, layout }) {
  const totals = useMemo(() => {
    let res = 0, inf = 0, placed = 0
    for (const tileId of Object.values(mapTiles)) {
      const tile = getTileById(tileId)
      if (!tile) continue
      res += getTileResources(tile)
      inf += getTileInfluence(tile)
      placed++
    }
    return { res, inf, placed, total: layout.positions.length }
  }, [mapTiles, layout])

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-hull/80 text-xs font-mono">
      <span className="text-dim">
        {totals.placed}/{totals.total} tiles
      </span>
      <span className="text-gold">{totals.res}R</span>
      <span className="text-plasma">{totals.inf}I</span>
      {totals.placed > 0 && (
        <span className="text-dim ml-auto">
          avg {(totals.res / totals.placed).toFixed(1)}R / {(totals.inf / totals.placed).toFixed(1)}I
        </span>
      )}
    </div>
  )
}

// ── Main MapBuilder ───────────────────────────────────────────────────────────

export default function MapBuilder({ gameState, isHost, onClose, onUpdateMap }) {
  const [selectedPos, setSelectedPos] = useState(null) // { q, r } or null
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const [expansionFilter, setExpansionFilter] = useState(() => {
    // Default: match what's enabled for this game
    const exps = gameState.expansions ?? { base: true, pok: false, te: false }
    return new Set(Object.keys(exps).filter(k => exps[k]))
  })
  const [typeFilter, setTypeFilter] = useState(new Set(['blue', 'red', 'home', 'mecatol', 'hyperlane', 'frontier']))
  const pickerRef = useRef(null)

  const mapTiles  = gameState.mapTiles  ?? {}
  const mapLayout = gameState.mapLayout ?? 'standard-6'
  const layout    = getLayoutById(mapLayout)

  // Auto-tiles (Mecatol Rex + faction home systems) merged under manual tiles
  const autoTiles = useMemo(() => computeAutoTiles(gameState, layout), [gameState, layout])
  const effectiveTiles = useMemo(() => ({ ...autoTiles, ...mapTiles }), [autoTiles, mapTiles])

  // Set of already-placed tile IDs (from manual placements only, so auto-tiles
  // don't grey out tiles that could still be manually placed elsewhere)
  const placedTileIds = useMemo(() => new Set(Object.values(mapTiles).map(Number)), [mapTiles])

  // Available tiles for the picker
  const availableTiles = useMemo(() => {
    const expansions = {}
    for (const k of expansionFilter) expansions[k] = true
    return getTilesByExpansion(expansions)
      .filter(t => typeFilter.has(t.type))
      .filter(t => t.type !== 'home') // home tiles handled separately
  }, [expansionFilter, typeFilter])

  function handleHexClick(q, r) {
    const key = `${q},${r}`
    if (selectedPos && `${selectedPos.q},${selectedPos.r}` === key) {
      setSelectedPos(null)
    } else {
      setSelectedPos({ q, r })
      // scroll picker into view after state update
      setTimeout(() => pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    }
  }

  function placeTile(tileId) {
    if (!selectedPos || !isHost) return
    const key = `${selectedPos.q},${selectedPos.r}`
    onUpdateMap({ mapTiles: { ...mapTiles, [key]: tileId } })
    setSelectedPos(null)
  }

  function removeTile() {
    if (!selectedPos || !isHost) return
    const key = `${selectedPos.q},${selectedPos.r}`
    const next = { ...mapTiles }
    delete next[key]
    onUpdateMap({ mapTiles: next })
    setSelectedPos(null)
  }

  function clearAll() {
    if (!isHost) return
    if (!confirm('Clear all placed tiles?')) return
    onUpdateMap({ mapTiles: {} })
    setSelectedPos(null)
  }

  function switchLayout(newId) {
    if (!isHost) return
    if (Object.keys(mapTiles).length > 0) {
      if (!confirm('Switching layout will clear all placed tiles. Continue?')) return
    }
    onUpdateMap({ mapLayout: newId, mapTiles: {} })
    setShowLayoutPicker(false)
    setSelectedPos(null)
  }

  const selectedKey = selectedPos ? `${selectedPos.q},${selectedPos.r}` : null
  const selectedTileId = selectedKey ? effectiveTiles[selectedKey] : null
  const selectedTile   = selectedTileId ? getTileById(selectedTileId) : null

  const vb = useMemo(() => computeViewBox(layout.positions, HEX_SIZE), [layout])

  function toggleFilter(set, setter, key) {
    setter(prev => {
      const next = new Set(prev)
      if (next.has(key)) { if (next.size > 1) next.delete(key) }
      else next.add(key)
      return next
    })
  }

  // Which expansions are available for filter chips
  const gameExpansions = gameState.expansions ?? { base: true, pok: false, te: false }
  const enabledExpansions = Object.keys(gameExpansions).filter(k => gameExpansions[k])

  return (
    <div className="fixed inset-0 bg-void flex flex-col overflow-hidden" style={{ zIndex: 30 }}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-hull flex-shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-dim hover:text-text transition-colors">
          <ChevronLeft size={16} />
          <span className="font-display text-xs tracking-widest">MAP</span>
        </button>

        <button
          onClick={() => setShowLayoutPicker(true)}
          className="flex items-center gap-1 font-body text-sm text-text hover:text-gold transition-colors"
        >
          <span>{layout.name}</span>
          <ChevronDown size={14} className="text-dim" />
        </button>

        {isHost && (
          <button onClick={clearAll} className="text-dim hover:text-danger transition-colors">
            <Trash2 size={15} />
          </button>
        )}
      </header>

      {/* Map SVG — scrollable */}
      <div className="flex-1 overflow-auto bg-void flex items-center justify-center" style={{ minHeight: 0 }}>
        <svg
          viewBox={`${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`}
          width="100%"
          height="100%"
          style={{ maxHeight: '100%', touchAction: 'none' }}
        >
          {layout.positions.map(({ q, r, isHome, seatIndex }) => {
            const key = `${q},${r}`
            const tileId = effectiveTiles[key]  // auto-fill + manual overrides
            const tile = tileId ? getTileById(tileId) : null
            return (
              <HexCell
                key={key}
                q={q} r={r}
                size={HEX_SIZE}
                tile={tile}
                isHome={isHome}
                seatIndex={seatIndex}
                isSelected={selectedKey === key}
                onClick={() => handleHexClick(q, r)}
              />
            )
          })}
        </svg>
      </div>

      {/* Stats bar — counts auto-fills too */}
      <MapStats mapTiles={effectiveTiles} layout={layout} />

      {/* Tile Picker — shown when a hex is selected */}
      {selectedPos && (
        <div ref={pickerRef} className="flex-shrink-0 bg-hull border-t border-border" style={{ maxHeight: '40vh' }}>
          {/* Picker header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="font-display text-xs tracking-widest text-dim">
              PLACE TILE {selectedTile ? `— ${selectedTile.planets.map(p => p.name).join(', ')}` : `(${selectedKey})`}
            </span>
            <div className="flex items-center gap-2">
              {selectedTile && isHost && (
                <button
                  onClick={removeTile}
                  className="font-body text-xs text-danger hover:text-danger/80 border border-danger/30 rounded px-2 py-0.5"
                >
                  Remove
                </button>
              )}
              <button onClick={() => setSelectedPos(null)} className="text-dim hover:text-text">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex gap-1.5 px-4 py-2 overflow-x-auto flex-shrink-0">
            {/* Expansion filters — only show expansions enabled in game */}
            {enabledExpansions.map(exp => (
              <button
                key={exp}
                onClick={() => toggleFilter(expansionFilter, setExpansionFilter, exp)}
                className={`flex-shrink-0 font-display text-xs px-2 py-0.5 rounded border transition-colors tracking-wide ${
                  expansionFilter.has(exp)
                    ? 'border-gold bg-gold/10 text-gold'
                    : 'border-border text-dim'
                }`}
              >
                {EXPANSION_LABELS[exp]}
              </button>
            ))}

            <div className="w-px bg-border mx-1 flex-shrink-0" />

            {/* Type filters */}
            {['blue', 'red', 'hyperlane'].map(type => (
              <button
                key={type}
                onClick={() => toggleFilter(typeFilter, setTypeFilter, type)}
                className={`flex-shrink-0 font-display text-xs px-2 py-0.5 rounded border transition-colors tracking-wide ${
                  typeFilter.has(type)
                    ? 'border-plasma bg-plasma/10 text-plasma'
                    : 'border-border text-dim'
                }`}
              >
                {TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {/* Tile cards */}
          {!isHost ? (
            <div className="px-4 py-3 text-dim font-body text-sm">
              Only the host can place tiles.
            </div>
          ) : (
            <div className="flex gap-2 px-4 pb-4 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              {availableTiles.length === 0 ? (
                <span className="text-dim font-body text-sm py-2">No tiles match current filters.</span>
              ) : (
                availableTiles.map(tile => (
                  <TileMini
                    key={tile.id}
                    tile={tile}
                    isPlaced={placedTileIds.has(tile.id) && effectiveTiles[selectedKey] !== tile.id}
                    onClick={() => placeTile(tile.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Layout picker modal */}
      {showLayoutPicker && (
        <LayoutPicker
          currentId={mapLayout}
          onSelect={switchLayout}
          onClose={() => setShowLayoutPicker(false)}
        />
      )}
    </div>
  )
}
