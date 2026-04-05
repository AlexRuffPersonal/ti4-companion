# CLAUDE.md — TI4 Companion

AI assistant reference guide for the **Twilight Imperium 4 Companion** app — a real-time browser-based companion for TI4 board game sessions.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 (function components + hooks) |
| Build tool | Vite 7 (ESM modules) |
| Styling | Tailwind CSS 3 with custom sci-fi theme |
| Backend | Supabase (PostgreSQL + Realtime) |
| Icons | Lucide React |
| Node | >= 20.19.0 (see `.nvmrc`) |

---

## Project Structure

```
ti4-companion/
├── index.html              # App entry point (fonts, viewport meta)
├── vite.config.js          # Minimal — just the React plugin
├── tailwind.config.js      # Custom color palette + fonts
├── postcss.config.js       # Tailwind + Autoprefixer
├── supabase-schema.sql     # Database schema to run in Supabase dashboard
├── .env.example            # Required environment variables
├── DEPLOYMENT.md           # Full deployment walkthrough (Supabase + Vercel)
├── TODO.md                 # Prioritized feature backlog (80+ items)
└── src/
    ├── main.jsx            # React root render
    ├── App.jsx             # Top-level routing: login → setup → dashboard
    ├── index.css           # Tailwind base/components/utilities layers
    ├── supabaseClient.js   # Supabase client singleton
    ├── components/
    │   ├── Dashboard.jsx   # Main game UI (scoreboard, tabs, phase control)
    │   ├── SetupScreen.jsx # Game creation/join flow
    │   ├── LoginScreen.jsx # Supabase email/password auth
    │   ├── PlayerRow.jsx   # Per-player expandable card
    │   ├── MapBuilder.jsx  # Interactive hex map editor
    │   ├── AgendaPhase.jsx # Agenda voting interface
    │   ├── TradeLog.jsx    # Transaction history
    │   └── RulesLookup.jsx # Searchable rules reference
    ├── hooks/
    │   └── useGameState.js # ALL game business logic lives here
    └── data/
        ├── gameData.js     # Factions, strategy cards, agendas, techs, rules
        ├── tiles.js        # All hex tiles with planet stats
        └── mapLayouts.js   # Hex grid coordinate systems
```

---

## Development Commands

```bash
npm install       # Install dependencies
npm run dev       # Dev server at http://localhost:5173 (HMR enabled)
npm run build     # Production bundle → dist/
npm run preview   # Preview production build locally
```

There are **no tests**. No test framework is installed.

---

## Environment Variables

Copy `.env.example` to `.env` before running locally:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Both variables are required — `supabaseClient.js` throws an explicit error if either is missing.

---

## Architecture

### State Management

All game state flows through the `useGameState` custom hook (`src/hooks/useGameState.js`). There is no Redux, Zustand, or React Context for game data — the hook is instantiated at the top level and props are passed down.

**Pattern:**
1. User action fires a handler in `useGameState`
2. State is updated locally (optimistic)
3. Full state blob is written to Supabase (`games.state` JSONB column)
4. Realtime subscription on the `games` table broadcasts the update to all connected clients
5. On DB failure, state rolls back and an error is shown

### Database Schema

Single `games` table:

```sql
CREATE TABLE public.games (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT UNIQUE NOT NULL,   -- 6-char room code e.g. "TI4KX7"
  state      JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Row-level security is enabled but **permissive** — the anon key can read/insert/update any row. Access control is application-layer only (room code + host browser ID).

### Game State Shape

The entire game lives in one JSON blob. Top-level keys:

```javascript
{
  round,                  // 1–8
  phase,                  // "Strategy" | "Action" | "Status" | "Agenda"
  vpGoal,                 // typically 10 or 14
  speakerId,              // player id
  custodiansClaimed,
  agendaPhaseUnlocked,
  expansions: { base, pok, te },   // which expansions are active
  galacticEvent,
  players: [ /* see Player shape below */ ],
  laws,                   // active law cards
  agendaDeck,
  agendaDiscard,
  currentAgendas,
  agendaVotes,
  transactions,           // trade log entries
  permissions,            // "host" | "all"
  hostBrowserId,
  mapLayout,
  mapTiles,
  theFractureInPlay,
  thundersEdgeInPlay,
  thundersEdgeSlices
}
```

**Player shape:**

```javascript
{
  id, name, faction, colour, vp,
  strategyCard, strategyCard2, passed,
  commandTokens: { tactic, fleet, strategy },
  commodities, tradeGoods,
  technologies: [],
  leaders: { agent, commander, hero },
  breakthrough,
  secretObjectivesHeld, secretObjectivesScored,
  promissoryNotes: []
}
```

### Hex Map System

`MapBuilder.jsx` uses a **pointy-top axial coordinate** grid (`q`, `r`). Key functions are in `src/data/mapLayouts.js`:

- `getRingHexes(center, radius)` — cube ring distance formula
- `axialToPixel(q, r, size)` — coordinate → screen position
- Home system positions are pre-defined per seat index
- Mecatol Rex auto-fills the center hex

### Component Conventions

- **PascalCase** filenames and exports matching component name
- **camelCase** for functions; handlers prefixed `handle*`, toggles `toggle*`, adjustments `adjust*`
- **UPPER_SNAKE_CASE** for constants in data files
- No utility/helper file — logic stays inline or in `useGameState`
- No CSS modules — all styling via Tailwind utility classes

### Tailwind Theme

Custom colors defined in `tailwind.config.js`:

| Token | Usage |
|-------|-------|
| `void` | Background (near black) |
| `hull` | Slightly lighter dark surface |
| `panel` | Card/panel backgrounds |
| `gold` | Accent, highlights |
| `plasma` | Primary action color |
| `danger` | Errors, warnings |
| `success` | Positive states |
| `muted` / `dim` | Subdued text |

Fonts: **Orbitron** (headings/display), **Rajdhani** (body), **Space Mono** (monospace). Loaded from Google Fonts in `index.html`.

---

## Data Files

### `src/data/gameData.js`

Source of truth for all rules data. Key exports:

- `FACTIONS` — 17 base + 7 PoK + 6 Thunder's Edge factions with starting techs
- `STRATEGY_CARDS` — 8 cards with primary/secondary ability descriptions
- `AGENDAS` — 50 cards (30 laws + 20 directives) with vote outcomes
- `TECHNOLOGIES` — 48 techs grouped by color
- `PHASES` — 4 game phases with step descriptions
- `GALACTIC_EVENTS` — 20 events with complexity ratings
- `PLAYER_COLORS` — 8 colors with hex codes
- `RULES_TOPICS` — 15 reference entries for RulesLookup

### `src/data/tiles.js`

All hex tiles. Each tile:

```javascript
{
  id: "001",
  name: "Mecatol Rex",
  type: "blue" | "red" | "home" | "hyperlane" | "frontier",
  expansion: "base" | "pok" | "te",
  planets: [{ name, resources, influence }],
  anomaly: "asteroid_field" | "gravity_rift" | "supernova" | "nebula" | null,
  wormhole: "alpha" | "beta" | "delta" | null
}
```

### `src/data/mapLayouts.js`

Pre-computed hex layouts for 6, 7, and 8 player games, plus utility functions for the hex grid math.

---

## Expansions

The app supports three expansions toggled at game creation:

| Key | Name |
|-----|------|
| `base` | Base game |
| `pok` | Prophecy of Kings |
| `te` | Thunder's Edge (fan expansion) |

Thunder's Edge adds: expedition slices, breakthrough tokens, fracture mechanic, and 6 additional factions.

---

## Permission Model

- `hostBrowserId` is set at game creation to the creator's browser fingerprint
- `permissions: "host"` — only the host can change most game state
- `permissions: "all"` — any player can update any state
- This is enforced in the UI only; Supabase RLS does not restrict writes by player

---

## Bug Tracking Convention

Inline comments reference known bugs with a numbered format:

```javascript
// BUG #5 FIX: Agenda deck limited to 50 (was 62 due to duplicates)
// BUG #2 FIX: Leader status cycle corrected
// BUG #11 FIX: Pre-populate faction starting techs
```

When fixing bugs, add a similar comment to document the change.

---

## Deployment

The app deploys to **Vercel** (frontend) + **Supabase** (backend). See `DEPLOYMENT.md` for the complete walkthrough. Key points:

- No backend server — entirely client-side SPA
- Vercel auto-deploys on push to `main`
- Environment variables must be set in Vercel dashboard
- Supabase free tier is sufficient for friend-group usage
- Realtime is configured for 10 events/second

---

## Common Patterns to Follow

1. **Add new game data** in `src/data/gameData.js` — keep it as a plain constant export
2. **Add new game actions** in `useGameState.js` — update state locally first, then persist to Supabase
3. **Add new UI features** in a component — receive state/handlers via props, no new state management patterns
4. **Add new tile data** in `src/data/tiles.js` following the existing tile object shape
5. **Do not introduce** new state management libraries, CSS frameworks, or backend dependencies without discussion
6. **Do not add tests** unless explicitly requested (no test infrastructure exists)
7. **Preserve the sci-fi aesthetic** — use existing Tailwind color tokens, not arbitrary color values
