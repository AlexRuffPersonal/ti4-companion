# CLAUDE.md — TI4 Companion App

This file gives Claude Code full codebase context. Read this instead of exploring files at session start.

---

## Project Overview

A real-time multiplayer companion app for **Twilight Imperium 4th Edition** (base + Prophecy of Kings + Thunder's Edge expansions). Players join a shared room via a 6-character code and see live game state. Hosted on Vercel + Supabase (free tier).

**Current capability:** Scorekeeper + reference tool. See `GAMEPLAY_ROADMAP.md` for the plan to add full gameplay (planets, objectives, combat, etc.). See `FRONTEND_ROADMAP.md` for the Flutter/Dart mobile app plan.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS (dark custom theme) |
| Backend | Supabase (PostgreSQL + Realtime + Auth) |
| State | React hooks (`useGameState` custom hook) |
| Icons | `lucide-react` (14–16px, `className="w-4 h-4"`) |
| Deploy | Vercel + Supabase free tier |

**Node.js 20.19+ required.** Dev: `npm run dev`. Build: `npm run build`.

---

## Directory Structure

```
/
  src/
    App.jsx                  # Entry — auth gate, game gate, overlay switcher
    main.jsx                 # React root mount
    supabaseClient.js        # Supabase client init (reads VITE_ env vars)

    data/
      gameData.js            # 314 lines — factions, agendas, techs, rules, phases
      tiles.js               # 833 lines — 115 system tiles with planets/anomalies
      mapLayouts.js          # 437 lines — 11 hex map layouts (axial coordinates)

    hooks/
      useGameState.js        # 239 lines — ALL game state + Supabase sync

    components/
      Dashboard.jsx          # Main board: scoreboard, phase, player rows
      PlayerRow.jsx          # Expandable per-player: resources, techs, leaders
      SetupScreen.jsx        # 3-step game creation wizard + join flow
      LoginScreen.jsx        # Supabase email/password auth
      AgendaPhase.jsx        # Agenda voting overlay
      MapBuilder.jsx         # Hex map editor overlay
      TradeLog.jsx           # Trade history overlay
      RulesLookup.jsx        # Searchable rules + agendas reference overlay

  supabase-schema.sql        # DB schema (games table, RLS, realtime)
  GAMEPLAY_ROADMAP.md        # 12-phase plan: planets → combat → full gameplay
  FRONTEND_ROADMAP.md        # 9-phase Flutter/Dart mobile app plan
  POTENTIAL_FEATURES.md      # 80-feature backlog (original TODO)
  TODO.md                    # Pointer to roadmap files
  DEPLOYMENT.md              # Vercel + Supabase setup guide
```

---

## Navigation Model

No router. `App.jsx` uses a single `overlay` state variable:

```javascript
const [overlay, setOverlay] = useState(null) // null | 'agenda' | 'rules' | 'trade' | 'map'
```

Render logic (in order):
1. `authLoading` → loading spinner
2. `!user` → `<LoginScreen />`
3. `!gameState` → `<SetupScreen />`
4. `overlay === 'agenda'` → `<AgendaPhase />`
5. `overlay === 'rules'` → `<RulesLookup />`
6. `overlay === 'map'` → `<MapBuilder />`
7. `overlay === 'trade'` → `<TradeLog />`
8. default → `<Dashboard />`

Overlays receive `onClose={() => setOverlay(null)}`.

---

## Database Schema

**Single table: `public.games`**

```sql
id          UUID PRIMARY KEY
code        TEXT UNIQUE NOT NULL   -- 6-char room code, e.g. "TI4KX7"
state       JSONB NOT NULL         -- entire game state blob
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ            -- auto-updated on change
```

- Index on `code` for fast lookup
- RLS: anyone can SELECT / INSERT / UPDATE (trust enforced app-side)
- Realtime: `supabase_realtime` publication on `games` table

**Environment variables (`.env`):**
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

---

## Complete Game State Shape

```javascript
{
  // Core
  round: 1,
  phase: 'strategy' | 'action' | 'status' | 'agenda',
  vpGoal: 10 | 14,
  speakerId: '<uuid>',

  // Expansions
  expansions: { base: true, pok: true, te: true },
  galacticEvent: null | '<event name>',

  // Custodians / Agenda gate
  custodiansClaimed: false,
  agendaPhaseUnlocked: false,

  // Agenda system
  agendaDeck: [/* shuffled indices into AGENDAS array */],
  agendaDiscard: [],
  currentAgendas: [],       // up to 2 deck indices being voted on
  agendaVotes: {
    '${agendaIndex}-${playerId}': { choice: string, votes: number, playerId: string }
  },
  laws: [],                 // indices of enacted law agendas

  // Trade log
  transactions: [{
    id: '<uuid>', fromId: '<uuid>', toId: '<uuid>',
    items: string, round: number, phase: string, timestamp: ISO8601
  }],

  // Map
  mapLayout: 'standard-6',      // layout ID from mapLayouts.js
  mapTiles: {
    '0,0': { q: 0, r: 0, tileId: 18, owner: null },
    // key = "q,r", tileId = tile.id from tiles.js
  },

  // Thunder's Edge
  theFractureInPlay: false,
  thundersEdgeInPlay: false,
  thundersEdgeSlices: { '<playerId>': [/* sliceIndices */] },

  // Permissions
  permissions: {
    'slot-0': 'own' | 'all',   // keyed by SLOT INDEX, not player ID
    'slot-1': 'own',
    // ...
  },
  hostBrowserId: '<uuid>',      // set to crypto.randomUUID() on game create

  // Players array (see shape below)
  players: [],

  createdAt: ISO8601,
}
```

**Per-player shape:**
```javascript
{
  id: '<uuid>',
  name: string,
  faction: string,            // e.g. 'The Federation of Sol'
  colour: 'yellow' | 'blue' | 'red' | 'green' | 'purple' | 'orange' | 'pink' | 'cyan',

  vp: 0,
  secretObjectivesHeld: 1,
  secretObjectivesScored: 0,

  commodities: 3,             // starting value, faction-dependent
  tradeGoods: 0,

  commandTokens: { tactic: 3, fleet: 3, strategy: 2 },

  technologies: [],           // pre-populated with FACTION_STARTING_TECHS[faction]
  strategyCard: null,         // card ID 1–8
  strategyCard2: null,        // second slot (3–4 player games)
  passed: false,

  leaders: {
    agent: 'unlocked',        // 'locked' | 'unlocked' | 'exhausted'
    commander: 'locked',      // 'locked' | 'unlocked'
    hero: 'locked',           // 'locked' | 'unlocked' | 'purged'
  },

  breakthrough: false,        // Thunder's Edge only
  promissoryNotes: [],        // display only (not yet interactive)
}
```

---

## `useGameState` Hook API

**Imported in `App.jsx`** and passed as props through component tree.

```javascript
// State
gameState        // full state object or null
roomCode         // 6-char string
myPlayerId       // UUID of current user's player slot
loading          // boolean
error            // string | null
syncing          // boolean (true during Supabase write)
isHost           // boolean (myBrowserId === gameState.hostBrowserId)

// Game lifecycle
createGame(initialState)         // generates code, writes to DB, subscribes
joinGame(code)                   // looks up by code, subscribes
leaveGame()                      // unsubscribes, clears localStorage
setError(msg)

// Low-level updaters
updateGame(updater)              // updater: state => newState
updatePlayer(playerId, updater)  // updater: player => newPlayer

// Player mutations
adjustPlayerVP(id, delta)
adjustCounter(id, field, delta, min?, max?)
adjustCommandToken(id, pool, delta)  // pool: 'tactic'|'fleet'|'strategy'
toggleTechnology(id, techName)
setLeaderStatus(id, leader, status)  // leader: 'agent'|'commander'|'hero'
assignStrategyCard(id, cardId, slot?) // slot defaults to 1
togglePassed(id)

// Game phase
advancePhase()
claimCustodians(playerId)

// Agenda
drawAgenda()
castVote(playerId, agendaIndex, choice, votes)
resolveAgenda(agendaIndex, outcome, isLaw)
repealLaw(agendaIndex)

// Trade
logTransaction(fromId, toId, items)

// Thunder's Edge
claimExpeditionSlice(playerId, sliceIndex)
triggerFracture()

// Permissions
setPlayerPermission(slotKey, level)  // slotKey = 'slot-0', level = 'own'|'all'
canEdit(playerId)                    // returns boolean
```

**Immutable update pattern — always use:**
```javascript
// Top-level
updateGame(s => ({ ...s, round: s.round + 1 }))

// Player field
updatePlayer(id, p => ({ ...p, tradeGoods: p.tradeGoods + 1 }))

// Nested object
updatePlayer(id, p => ({
  ...p,
  commandTokens: { ...p.commandTokens, tactic: p.commandTokens.tactic + 1 }
}))

// Array toggle
updatePlayer(id, p => ({
  ...p,
  technologies: p.technologies.includes(tech)
    ? p.technologies.filter(t => t !== tech)
    : [...p.technologies, tech]
}))
```

---

## Data Files Quick Reference

### `gameData.js` exports
| Export | Type | Content |
|--------|------|---------|
| `FACTIONS` | `{ base[], pok[], te[] }` | 17 + 7 + 6 faction names |
| `ALL_FACTIONS` | `string[]` | All 30 faction names |
| `FACTION_STARTING_TECHS` | `{ [faction]: string[] }` | Starting tech per faction |
| `PLAYER_COLOURS` | `{ id, label, hex, tw }[]` | 8 colours |
| `STRATEGY_CARDS` | `{ id, name, code, primary, secondary }[]` | 8 cards |
| `PHASES` | `string[]` | `['strategy','action','status','agenda']` |
| `PHASE_LABELS` | `{ [phase]: string }` | Human-readable labels |
| `PHASE_DESCRIPTIONS` | `{ [phase]: string }` | Rule descriptions |
| `GALACTIC_EVENTS` | `{ name, complexity }[]` | 20 TE events |
| `AGENDAS` | `{ name, type, outcome, notes }[]` | 50 entries (indices used as IDs) |
| `TECHNOLOGIES` | `{ red[], blue[], green[], yellow[] }` | 24 tech cards |
| `RULES` | `{ topic, content }[]` | 16 rule topics |

### `tiles.js` exports
| Export | Notes |
|--------|-------|
| `TILES` | All 115 system tiles |
| `getTileById(id)` | Returns tile or null |
| `getTilesByExpansion({ base, pok, te })` | Filtered tile array |
| `getTileResources(tile)` | Sum of all planet resources |
| `getTileInfluence(tile)` | Sum of all planet influence |
| `ANOMALY_LABELS` | `{ asteroid_field: 'AST', nebula: 'NB', ... }` |
| `WORMHOLE_LABELS` | `{ alpha: 'α', beta: 'β', ... }` |

**Tile shape:**
```javascript
{
  id: number,          // 1–115
  expansion: 'base' | 'pok' | 'te',
  type: 'home' | 'blue' | 'red' | 'mecatol' | 'hyperlane' | 'frontier',
  homeFor: string | null,
  planets: [{ name, resources, influence, trait, legendary }],
  anomaly: null | 'asteroid_field' | 'nebula' | 'supernova' | 'gravity_rift' | 'entropic_scar',
  wormhole: null | 'alpha' | 'beta' | 'delta' | 'gamma',
}
```

### `mapLayouts.js` exports
| Export | Notes |
|--------|-------|
| `MAP_LAYOUTS` | 11 layout objects |
| `getLayoutById(id)` | Returns layout or defaults to `standard-6` |
| `getLayoutsForPlayerCount(n)` | Returns matching layouts |

**Layout position shape:**
```javascript
{ q: number, r: number, ring: number, isHome: boolean, seatIndex: number | null }
```

Map coordinate key format: `"${q},${r}"` (e.g. `"0,0"` for center).

---

## Component Props Patterns

Components receive everything as props from `App.jsx`. No Context API used.

**Dashboard.jsx key props:**
```javascript
{ gameState, myPlayerId, isHost, canEdit, syncing, roomCode, userEmail,
  onAdvancePhase, onClaimCustodians, onAdjustVP, onAdjustCounter,
  onAdjustCommandToken, onAssignStrategyCard, onTogglePassed,
  onToggleTechnology, onSetLeaderStatus, onSetPermission,
  onOpenAgenda, onOpenRules, onOpenTrade, onOpenMap,
  onLeave, onLogout }
```

**Overlay components key props:**
```javascript
// All overlays receive:
{ gameState, myPlayerId, isHost, canEdit, onClose }

// AgendaPhase also:
{ onDrawAgenda, onCastVote, onResolveAgenda, onRepealLaw }

// MapBuilder also:
{ onUpdateMap: patch => updateGame(s => ({ ...s, ...patch })) }

// TradeLog also:
{ onLogTransaction }
```

---

## Coding Conventions

**Tailwind classes — established patterns:**
- Background: `bg-void` (custom `#0a0a1a`), `bg-surface` (cards/panels)
- Accent: `text-plasma` (purple), `text-gold` (yellow/gold highlights)
- Dim text: `text-dim` (secondary labels)
- Buttons: `btn-primary`, `btn-secondary`, `btn-ghost` (custom utilities)
- Icons: always `w-4 h-4` (16px) from `lucide-react`
- Spacing: `gap-2`, `gap-3` between elements; `p-3`, `p-4` for panels
- Borders: `border border-white/10` (subtle dividers)
- Animations: `animate-pulse` (syncing), `transition-all duration-200`

**Permission gating pattern:**
```javascript
// In any component that mutates state:
if (!canEdit(player.id)) return  // bail early
// OR
<button onClick={...} disabled={!canEdit(player.id)} className="...">
```

**Host-only actions:**
```javascript
{isHost && <button onClick={onAdvancePhase}>Next Phase</button>}
```

**Player iteration:**
```javascript
// Initiative order (sorted by strategy card number)
const ordered = [...gameState.players].sort((a, b) =>
  (a.strategyCard ?? 99) - (b.strategyCard ?? 99)
)
```

**Agenda vote key format:** `'${agendaDeckIndex}-${playerId}'` — use deck index, not agenda name/id, to remain stable across resolutions.

---

## Supabase Patterns

```javascript
// Create game
const { error } = await supabase.from('games').insert({ code, state })

// Join / fetch game
const { data } = await supabase.from('games').select('state').eq('code', code.toUpperCase()).single()

// Update game
await supabase.from('games').update({ state: newState }).eq('code', roomCode)

// Realtime subscription
const channel = supabase
  .channel(`room:${roomCode}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `code=eq.${roomCode}` },
    () => { /* refetch state */ })
  .subscribe()

// Auth
supabase.auth.signInWithPassword({ email, password })
supabase.auth.signUp({ email, password })
supabase.auth.signOut()
supabase.auth.getSession()
supabase.auth.onAuthStateChange(callback)
```

**LocalStorage:** Only `'ti4:lastRoom'` is persisted — the 6-char room code for auto-rejoin on refresh.

---

## Phase Advancement Logic

`advancePhase()` in `useGameState.js`:
- Cycles: `strategy → action → status → agenda → strategy` (agenda skipped if `!agendaPhaseUnlocked`)
- On entering `strategy` (new round): increments `round`, clears `strategyCard/strategyCard2/passed` on all players
- On entering `status`: (future) should ready all planets, deal action cards
- Agenda phase locked until `custodiansClaimed === true`

---

## Known Data Constraints

- **Agenda deck** is initialized to first 50 entries of `AGENDAS` (not all 62 — fixed bug)
- **Strategy cards:** players 3–4 get 2 cards each; players 5–8 get 1 card each
- **Command tokens:** clamped 0–16 per pool
- **Commodities/trade goods:** no hard max enforced in state (UI uses reasonable bounds)
- **Faction starting techs:** populated at game creation from `FACTION_STARTING_TECHS` map

---

## Active Development Branch

```
claude/twilight-imperium-app-plan-ro90W
```

All feature work should be committed to this branch with descriptive messages.

---

## What's Already Built vs Planned

**Built (functional today):**
VP tracking, phase cycling, strategy cards, agenda voting (62 cards), trade log, hex map builder (115 tiles, 11 layouts), leader status, technology browser, command tokens, commodities, Supabase real-time sync, Supabase auth, host/guest permissions.

**Planned — see `GAMEPLAY_ROADMAP.md`:**
Planet control/exhaustion, objectives (public + secret), action cards, unit/fleet roster, production calculator, combat tracker, relics, draft system, enhanced agenda, Thunder's Edge deep features, promissory notes, stats.

**Planned — see `FRONTEND_ROADMAP.md`:**
Flutter/Dart app (iOS + Android), sharing the same Supabase backend. Key packages: `supabase_flutter`, `flutter_riverpod`, `freezed`, `go_router`.
