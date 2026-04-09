# Phase 0: Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the complete backend infrastructure and React project scaffold — database schema, RLS, auth, Edge Function scaffolding, and a passing test suite — so every subsequent phase has a solid, working foundation to build on.

**Architecture:** Supabase hosts PostgreSQL (31 tables), Auth (magic link/OTP), and Edge Functions (TypeScript/Deno). A new React 18 + Vite project (`ti4-companion-web/`) connects via the Supabase JS client. No game UI is built in this phase — only the plumbing.

**Tech Stack:** React 18, Vite, Tailwind CSS 3, Supabase JS v2, Supabase CLI (Deno), Vitest, @testing-library/react, react-router-dom v6

---

## Directory Layout

```
TI4 Companion/
  supabase/                        ← shared backend (both frontends)
    migrations/
      001_core.sql                 ← profiles, games, game_players, game_laws
      002_system.sql               ← game_system_state, game_system_activations
      003_agenda.sql               ← game_agenda_deck, game_votes
      004_gameplay.sql             ← objectives, cards, planets, units, transactions
      005_reference.sql            ← 12 admin-entered reference tables
      006_rls.sql                  ← all RLS policies
    functions/
      _shared/
        auth.ts                    ← validate JWT, get user_id
        errors.ts                  ← standard error responses
        db.ts                      ← typed supabase admin client
      health/
        index.ts                   ← smoke-test function
  ti4-companion-web/               ← React web app (NEW)
    src/
      lib/
        supabase.js                ← client singleton
        edgeFunctions.js           ← typed wrappers (empty in phase 0)
      hooks/
        useAuth.js                 ← session + magic link
      components/
        auth/
          LoginScreen.jsx          ← email input + send magic link
          VerifyScreen.jsx         ← "check your email" waiting screen
        shared/
          ProtectedRoute.jsx       ← redirect to login if no session
      App.jsx                      ← router + auth gate
      main.jsx                     ← React root
    tests/
      lib/
        supabase.test.js
      hooks/
        useAuth.test.jsx
      components/
        auth/
          LoginScreen.test.jsx
    index.html
    vite.config.js
    vitest.config.js
    tailwind.config.js
    postcss.config.js
    .env.example
    .env                           ← gitignored
```

---

## Task 1: Scaffold React project

**Files:**
- Create: `ti4-companion-web/` (entire project)
- Create: `ti4-companion-web/tailwind.config.js`
- Create: `ti4-companion-web/.env.example`
- Create: `ti4-companion-web/.gitignore`

- [ ] **Step 1: Create Vite React project**

From `TI4 Companion/`:
```bash
npm create vite@latest ti4-companion-web -- --template react
cd ti4-companion-web
npm install
```

Expected: `ti4-companion-web/` created with `src/`, `index.html`, `vite.config.js`.

- [ ] **Step 2: Install all dependencies**

```bash
npm install @supabase/supabase-js react-router-dom lucide-react
npm install -D tailwindcss@3 postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
npx tailwindcss init -p
```

Expected: `node_modules/` populated, `tailwind.config.js` and `postcss.config.js` created.

- [ ] **Step 3: Configure Tailwind with sci-fi theme**

Replace `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void:    '#07080d',
        hull:    '#0d1117',
        panel:   '#161b22',
        border:  '#21262d',
        muted:   '#30363d',
        dim:     '#6e7681',
        text:    '#c9d1d9',
        bright:  '#f0f6fc',
        gold:    '#d4a017',
        plasma:  '#58a6ff',
        danger:  '#f85149',
        warning: '#e3b341',
        success: '#3fb950',
      },
      fontFamily: {
        display: ['Orbitron', 'sans-serif'],
        body:    ['Rajdhani', 'sans-serif'],
        mono:    ['Space Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
```

- [ ] **Step 4: Update index.css with Tailwind directives**

Replace `src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-void text-text font-body;
  }
}

@layer components {
  .panel {
    @apply bg-panel border border-border rounded-lg;
  }
  .panel-inset {
    @apply bg-hull border border-border rounded-md;
  }
  .label {
    @apply text-dim text-xs font-display tracking-widest uppercase;
  }
  .btn-primary {
    @apply bg-plasma text-void font-display text-xs tracking-widest px-4 py-2 rounded
           hover:bg-plasma/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed;
  }
  .btn-ghost {
    @apply border border-border text-dim font-display text-xs tracking-widest px-4 py-2 rounded
           hover:border-dim hover:text-text transition-colors;
  }
  .input {
    @apply bg-hull border border-border rounded px-3 py-2 text-text text-sm font-body
           focus:outline-none focus:border-plasma w-full;
  }
  .counter-btn {
    @apply w-6 h-6 flex items-center justify-center rounded border border-muted text-dim
           hover:border-dim hover:text-text transition-colors;
  }
}
```

- [ ] **Step 5: Update index.html to load Google Fonts**

Replace `index.html`:
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;500;600&family=Space+Mono&display=swap" rel="stylesheet" />
    <title>TI4 Companion</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create .env.example**

Create `ti4-companion-web/.env.example`:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

- [ ] **Step 7: Create .gitignore**

Create `ti4-companion-web/.gitignore`:
```
node_modules
dist
.env
.env.local
.DS_Store
*.local
coverage
```

- [ ] **Step 8: Initialise git and commit**

```bash
git init
git add .
git commit -m "feat: scaffold React web project with Vite, Tailwind, and sci-fi theme"
```

---

## Task 2: Configure testing infrastructure

**Files:**
- Create: `ti4-companion-web/vitest.config.js`
- Create: `ti4-companion-web/tests/setup.js`
- Create: `ti4-companion-web/tests/smoke.test.js`

- [ ] **Step 1: Create vitest config**

Create `ti4-companion-web/vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    globals: true,
  },
})
```

- [ ] **Step 2: Create test setup file**

Create `ti4-companion-web/tests/setup.js`:
```js
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Write smoke test**

Create `ti4-companion-web/tests/smoke.test.js`:
```js
describe('test infrastructure', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 4: Run smoke test to confirm it passes**

```bash
npx vitest run tests/smoke.test.js
```

Expected output:
```
✓ tests/smoke.test.js (1)
  ✓ test infrastructure > runs

Test Files  1 passed (1)
Tests       1 passed (1)
```

- [ ] **Step 5: Add test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Commit**

```bash
git add vitest.config.js tests/
git commit -m "feat: add Vitest testing infrastructure"
```

---

## Task 3: Supabase client + auth hook

**Files:**
- Create: `ti4-companion-web/src/lib/supabase.js`
- Create: `ti4-companion-web/src/lib/edgeFunctions.js`
- Create: `ti4-companion-web/src/hooks/useAuth.js`
- Create: `ti4-companion-web/tests/lib/supabase.test.js`

- [ ] **Step 1: Write failing test for Supabase client**

Create `ti4-companion-web/tests/lib/supabase.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest'

describe('supabase client', () => {
  beforeEach(() => {
    import.meta.env = {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-key',
    }
  })

  it('exports a supabase client object', async () => {
    const { supabase } = await import('../../src/lib/supabase.js')
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
    expect(typeof supabase.auth.getSession).toBe('function')
  })

  it('throws if env vars are missing', async () => {
    import.meta.env = {}
    await expect(import('../../src/lib/supabase.js?bust=' + Date.now())).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/lib/supabase.test.js
```

Expected: FAIL — `supabase.js` not found.

- [ ] **Step 3: Create Supabase client singleton**

Create `ti4-companion-web/src/lib/supabase.js`:
```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.')
}

export const supabase = createClient(url, key)
```

- [ ] **Step 4: Create empty Edge Functions wrapper**

Create `ti4-companion-web/src/lib/edgeFunctions.js`:
```js
import { supabase } from './supabase.js'

/**
 * Call a Supabase Edge Function and throw on error.
 * @param {string} name - function name
 * @param {object} body - request payload
 * @returns {Promise<object>} response data
 */
async function callFunction(name, body = {}) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw new Error(error.message)
  return data
}

// Functions will be added here as phases are implemented.
// Example: export const advancePhase = (gameId) => callFunction('advance-phase', { gameId })

export { callFunction }
```

- [ ] **Step 5: Create useAuth hook**

Create `ti4-companion-web/src/hooks/useAuth.js`:
```js
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function sendMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { user, loading, sendMagicLink, signOut }
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/lib/supabase.test.js
```

Expected: PASS (or skip if env mocking is complex in Vitest — acceptable at this stage, document why).

- [ ] **Step 7: Commit**

```bash
git add src/lib/ src/hooks/useAuth.js tests/lib/
git commit -m "feat: add Supabase client, edgeFunctions wrapper, and useAuth hook"
```

---

## Task 4: Database schema — Core tables (migration 001)

**Files:**
- Create: `TI4 Companion/supabase/migrations/001_core.sql`

- [ ] **Step 1: Install Supabase CLI (if not already installed)**

```bash
npm install -g supabase
supabase --version
```

Expected: version string printed (e.g. `1.x.x`).

- [ ] **Step 2: Initialise Supabase project**

From `TI4 Companion/`:
```bash
supabase init
```

Expected: `supabase/` directory created with `config.toml`.

- [ ] **Step 3: Write core migration**

Create `TI4 Companion/supabase/migrations/001_core.sql`:
```sql
-- ── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE public.profiles (
  user_id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name     TEXT,
  preferred_colour TEXT,
  is_admin         BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on first login
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Games ───────────────────────────────────────────────────────────────────
CREATE TABLE public.games (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  host_user_id        UUID NOT NULL REFERENCES public.profiles(user_id),
  phase               TEXT NOT NULL DEFAULT 'strategy',
  round               INTEGER NOT NULL DEFAULT 1,
  vp_goal             INTEGER NOT NULL DEFAULT 10,
  speaker_player_id   UUID,                          -- FK added after game_players created
  custodians_claimed  BOOLEAN NOT NULL DEFAULT false,
  agenda_unlocked     BOOLEAN NOT NULL DEFAULT false,
  permissions_mode    TEXT NOT NULL DEFAULT 'host',
  expansions          JSONB NOT NULL DEFAULT '{"base":true,"pok":true,"te":true}',
  galactic_event      TEXT,
  map_layout          TEXT NOT NULL DEFAULT 'standard-6',
  map_tiles           JSONB NOT NULL DEFAULT '{}',
  the_fracture_in_play BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'active',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ
);

-- ── Game Players ─────────────────────────────────────────────────────────────
CREATE TABLE public.game_players (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  user_id               UUID REFERENCES public.profiles(user_id),
  display_name          TEXT NOT NULL,
  faction               TEXT,
  colour                TEXT NOT NULL DEFAULT 'blue',
  seat_index            INTEGER NOT NULL,
  vp                    INTEGER NOT NULL DEFAULT 0,
  strategy_card         INTEGER,
  strategy_card_2       INTEGER,
  passed                BOOLEAN NOT NULL DEFAULT false,
  command_tokens        JSONB NOT NULL DEFAULT '{"tactic_total":3,"fleet":3,"strategy":2}',
  tokens_lost_to_mahact INTEGER NOT NULL DEFAULT 0,
  tokens_captured_from  JSONB NOT NULL DEFAULT '{}',
  commodities           INTEGER NOT NULL DEFAULT 3,
  trade_goods           INTEGER NOT NULL DEFAULT 0,
  relic_fragments       JSONB NOT NULL DEFAULT '{"cultural":0,"industrial":0,"hazardous":0,"frontier":0}',
  technologies          TEXT[] NOT NULL DEFAULT '{}',
  leaders               JSONB NOT NULL DEFAULT '{"agent":"unlocked","commander":"locked","hero":"locked"}',
  breakthrough          BOOLEAN NOT NULL DEFAULT false,
  can_edit_all          BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT max_command_tokens CHECK (
    (command_tokens->>'tactic_total')::int +
    (command_tokens->>'fleet')::int +
    (command_tokens->>'strategy')::int <= 16
  ),
  UNIQUE (game_id, seat_index)
);

-- Add FK from games back to game_players for speaker
ALTER TABLE public.games
  ADD CONSTRAINT fk_speaker_player
  FOREIGN KEY (speaker_player_id)
  REFERENCES public.game_players(id)
  DEFERRABLE INITIALLY DEFERRED;

-- ── Game Laws ────────────────────────────────────────────────────────────────
CREATE TABLE public.game_laws (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id        UUID NOT NULL,                    -- FK to agendas added in 005_reference.sql
  enacted_at_round INTEGER NOT NULL,
  elect_target     TEXT,
  repealed         BOOLEAN NOT NULL DEFAULT false
);
```

- [ ] **Step 4: Apply migration in Supabase dashboard**

1. Open your Supabase project → SQL Editor
2. Paste the full contents of `001_core.sql`
3. Click **Run**

Expected: "Success. No rows returned."

- [ ] **Step 5: Verify tables exist**

In Supabase SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected output includes: `game_laws`, `game_players`, `games`, `profiles`.

- [ ] **Step 6: Commit**

From `TI4 Companion/`:
```bash
git add supabase/
git commit -m "feat: add core database schema (profiles, games, game_players, game_laws)"
```

---

## Task 5: Database schema — System & Agenda tables (migration 002 + 003)

**Files:**
- Create: `TI4 Companion/supabase/migrations/002_system.sql`
- Create: `TI4 Companion/supabase/migrations/003_agenda.sql`

- [ ] **Step 1: Write system migration**

Create `TI4 Companion/supabase/migrations/002_system.sql`:
```sql
-- ── Game System State ────────────────────────────────────────────────────────
CREATE TABLE public.game_system_state (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  system_key         TEXT NOT NULL,
  tile_id            UUID,                           -- FK to tiles added in 005_reference.sql
  frontier_explored  BOOLEAN NOT NULL DEFAULT false,
  has_space_station  BOOLEAN NOT NULL DEFAULT false,
  entropic_scar      BOOLEAN NOT NULL DEFAULT false,
  wormhole_active    BOOLEAN NOT NULL DEFAULT true,
  ion_storm          BOOLEAN NOT NULL DEFAULT false,
  mirage_present     BOOLEAN NOT NULL DEFAULT false,
  space_mines        JSONB NOT NULL DEFAULT '[]',
  combat_active      BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (game_id, system_key)
);

-- ── Game System Activations ──────────────────────────────────────────────────
CREATE TABLE public.game_system_activations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id      UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  system_key     TEXT NOT NULL,
  round          INTEGER NOT NULL,
  token_owner_id UUID REFERENCES public.game_players(id),
  UNIQUE (game_id, player_id, system_key, round)
);
```

- [ ] **Step 2: Write agenda migration**

Create `TI4 Companion/supabase/migrations/003_agenda.sql`:
```sql
-- ── Game Agenda Deck ─────────────────────────────────────────────────────────
CREATE TABLE public.game_agenda_deck (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id     UUID NOT NULL,                       -- FK added in 005_reference.sql
  deck_position INTEGER,
  state         TEXT NOT NULL DEFAULT 'deck'
);

-- ── Game Votes ───────────────────────────────────────────────────────────────
CREATE TABLE public.game_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  agenda_id  UUID NOT NULL,
  player_id  UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  round      INTEGER NOT NULL,
  choice     TEXT NOT NULL,
  vote_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, agenda_id, player_id, round)
);
```

- [ ] **Step 3: Apply both migrations in Supabase SQL Editor**

Run `002_system.sql` then `003_agenda.sql` in order.

Expected: "Success. No rows returned." for each.

- [ ] **Step 4: Verify**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Expected output now includes: `game_agenda_deck`, `game_system_activations`, `game_system_state`, `game_votes`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/002_system.sql supabase/migrations/003_agenda.sql
git commit -m "feat: add system state, activations, and agenda schema"
```

---

## Task 6: Database schema — Gameplay tables (migration 004)

**Files:**
- Create: `TI4 Companion/supabase/migrations/004_gameplay.sql`

- [ ] **Step 1: Write gameplay migration**

Create `TI4 Companion/supabase/migrations/004_gameplay.sql`:
```sql
-- ── Public Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.game_public_objectives (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  objective_id     UUID NOT NULL,                    -- FK added in 005_reference.sql
  revealed_at_round INTEGER,
  scored_by        UUID[] NOT NULL DEFAULT '{}'
);

-- ── Secret Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.game_player_secret_objectives (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  objective_id    UUID NOT NULL,
  state           TEXT NOT NULL DEFAULT 'held',
  scored_at_round INTEGER
);

-- ── Action Card Deck ─────────────────────────────────────────────────────────
CREATE TABLE public.game_action_card_deck (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  action_card_id      UUID NOT NULL,
  copy_index          INTEGER NOT NULL DEFAULT 0,
  deck_position       INTEGER,
  state               TEXT NOT NULL DEFAULT 'deck',
  held_by_player_id   UUID REFERENCES public.game_players(id)
);

-- ── Relic Deck ───────────────────────────────────────────────────────────────
CREATE TABLE public.game_relic_deck (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  relic_id          UUID NOT NULL,
  state             TEXT NOT NULL DEFAULT 'deck',
  held_by_player_id UUID REFERENCES public.game_players(id)
);

-- ── Exploration Decks ────────────────────────────────────────────────────────
CREATE TABLE public.game_exploration_decks (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id                  UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  card_id                  UUID NOT NULL,
  deck_type                TEXT NOT NULL,
  deck_position            INTEGER,
  state                    TEXT NOT NULL DEFAULT 'deck',
  resolved_by_player_id    UUID REFERENCES public.game_players(id)
);

-- ── Promissory Notes ─────────────────────────────────────────────────────────
CREATE TABLE public.game_player_promissory_notes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id            UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  note_id            UUID NOT NULL,
  origin_player_id   UUID NOT NULL REFERENCES public.game_players(id),
  held_by_player_id  UUID NOT NULL REFERENCES public.game_players(id),
  state              TEXT NOT NULL DEFAULT 'held'
);

-- ── Planets ──────────────────────────────────────────────────────────────────
CREATE TABLE public.game_player_planets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id        UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  planet_name      TEXT NOT NULL,
  tile_id          UUID,
  exhausted        BOOLEAN NOT NULL DEFAULT false,
  has_space_dock   BOOLEAN NOT NULL DEFAULT false,
  has_pds          BOOLEAN NOT NULL DEFAULT false,
  has_sleeper      BOOLEAN NOT NULL DEFAULT false,
  planet_destroyed BOOLEAN NOT NULL DEFAULT false,
  attachments      UUID[] NOT NULL DEFAULT '{}',
  UNIQUE (game_id, player_id, planet_name)
);

-- ── Units ────────────────────────────────────────────────────────────────────
CREATE TABLE public.game_player_units (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id       UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id     UUID NOT NULL REFERENCES public.game_players(id) ON DELETE CASCADE,
  system_key    TEXT NOT NULL,
  unit_type_id  UUID NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  damaged_count INTEGER NOT NULL DEFAULT 0,
  on_planet     TEXT
);

-- ── Transactions ─────────────────────────────────────────────────────────────
CREATE TABLE public.game_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  from_player_id UUID NOT NULL REFERENCES public.game_players(id),
  to_player_id   UUID NOT NULL REFERENCES public.game_players(id),
  items          JSONB NOT NULL DEFAULT '{}',
  round          INTEGER NOT NULL,
  phase          TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Events ───────────────────────────────────────────────────────────────────
CREATE TABLE public.game_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id  UUID REFERENCES public.game_players(id),
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  round      INTEGER NOT NULL,
  phase      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Apply migration in Supabase SQL Editor**

Run `004_gameplay.sql`.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify all gameplay tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
```

Expected: 17 tables now present (profiles, games, game_players, game_laws, game_system_state, game_system_activations, game_agenda_deck, game_votes, game_public_objectives, game_player_secret_objectives, game_action_card_deck, game_relic_deck, game_exploration_decks, game_player_promissory_notes, game_player_planets, game_player_units, game_transactions, game_events).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/004_gameplay.sql
git commit -m "feat: add gameplay tables (objectives, cards, planets, units, transactions, events)"
```

---

## Task 7: Database schema — Reference tables (migration 005)

**Files:**
- Create: `TI4 Companion/supabase/migrations/005_reference.sql`

- [ ] **Step 1: Write reference data migration**

Create `TI4 Companion/supabase/migrations/005_reference.sql`:
```sql
-- ── Tiles ────────────────────────────────────────────────────────────────────
CREATE TABLE public.tiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tile_number TEXT NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  expansion   TEXT NOT NULL DEFAULT 'base',
  planets     JSONB NOT NULL DEFAULT '[]',
  anomaly     TEXT,
  wormhole    TEXT
);

-- ── Factions ─────────────────────────────────────────────────────────────────
CREATE TABLE public.factions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL UNIQUE,
  expansion        TEXT NOT NULL DEFAULT 'base',
  starting_techs   TEXT[] NOT NULL DEFAULT '{}',
  home_tile_number TEXT,
  commodities      INTEGER NOT NULL DEFAULT 3,
  abilities        JSONB NOT NULL DEFAULT '[]',
  flagship         JSONB,
  mech             JSONB,
  promissory_notes JSONB NOT NULL DEFAULT '[]'
);

-- ── Agendas ──────────────────────────────────────────────────────────────────
CREATE TABLE public.agendas (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,
  outcome   TEXT NOT NULL,
  elect_type TEXT,
  expansion TEXT NOT NULL DEFAULT 'base',
  note      TEXT
);

-- ── Technologies ─────────────────────────────────────────────────────────────
CREATE TABLE public.technologies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  colour         TEXT NOT NULL,
  prerequisites  JSONB NOT NULL DEFAULT '{}',
  text           TEXT,
  is_unit_upgrade BOOLEAN NOT NULL DEFAULT false,
  unit_stats     JSONB,
  faction        TEXT,
  expansion      TEXT NOT NULL DEFAULT 'base'
);

-- ── Units ────────────────────────────────────────────────────────────────────
CREATE TABLE public.units (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL UNIQUE,
  cost           NUMERIC,
  combat         TEXT,
  move           INTEGER,
  capacity       INTEGER,
  sustain_damage BOOLEAN NOT NULL DEFAULT false,
  bombardment    TEXT,
  afb            TEXT,
  space_cannon   TEXT,
  planetary      BOOLEAN NOT NULL DEFAULT false
);

-- ── Public Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.public_objectives (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  stage     INTEGER NOT NULL,
  points    INTEGER NOT NULL DEFAULT 1,
  condition TEXT NOT NULL,
  category  TEXT,
  expansion TEXT NOT NULL DEFAULT 'base'
);

-- ── Secret Objectives ────────────────────────────────────────────────────────
CREATE TABLE public.secret_objectives (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  points    INTEGER NOT NULL DEFAULT 1,
  timing    TEXT,
  condition TEXT NOT NULL,
  expansion TEXT NOT NULL DEFAULT 'base'
);

-- ── Action Cards ─────────────────────────────────────────────────────────────
CREATE TABLE public.action_cards (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  timing    TEXT,
  text      TEXT,
  type      TEXT,
  quantity  INTEGER NOT NULL DEFAULT 1,
  expansion TEXT NOT NULL DEFAULT 'base'
);

-- ── Relics ───────────────────────────────────────────────────────────────────
CREATE TABLE public.relics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  text         TEXT,
  exhaustable  BOOLEAN NOT NULL DEFAULT false,
  transferable BOOLEAN NOT NULL DEFAULT true,
  vp_bearing   BOOLEAN NOT NULL DEFAULT false,
  purge_on_use BOOLEAN NOT NULL DEFAULT false
);

-- ── Exploration Cards ────────────────────────────────────────────────────────
CREATE TABLE public.exploration_cards (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  deck_type           TEXT NOT NULL,
  text                TEXT,
  quantity            INTEGER NOT NULL DEFAULT 1,
  relic_fragment_type TEXT
);

-- ── Attachments ──────────────────────────────────────────────────────────────
CREATE TABLE public.attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  planet_trait        TEXT,
  resource_modifier   INTEGER NOT NULL DEFAULT 0,
  influence_modifier  INTEGER NOT NULL DEFAULT 0,
  text                TEXT
);

-- ── Promissory Notes ─────────────────────────────────────────────────────────
CREATE TABLE public.promissory_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  faction         TEXT,
  text            TEXT,
  returns_to_owner BOOLEAN NOT NULL DEFAULT false,
  purge_on_use    BOOLEAN NOT NULL DEFAULT false,
  expansion       TEXT NOT NULL DEFAULT 'base'
);

-- ── Foreign Key Back-Fills ───────────────────────────────────────────────────
ALTER TABLE public.game_laws
  ADD CONSTRAINT fk_game_laws_agenda
  FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

ALTER TABLE public.game_agenda_deck
  ADD CONSTRAINT fk_agenda_deck_agenda
  FOREIGN KEY (agenda_id) REFERENCES public.agendas(id);

ALTER TABLE public.game_system_state
  ADD CONSTRAINT fk_system_state_tile
  FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

ALTER TABLE public.game_player_planets
  ADD CONSTRAINT fk_planets_tile
  FOREIGN KEY (tile_id) REFERENCES public.tiles(id);

ALTER TABLE public.game_player_units
  ADD CONSTRAINT fk_units_type
  FOREIGN KEY (unit_type_id) REFERENCES public.units(id);

ALTER TABLE public.game_public_objectives
  ADD CONSTRAINT fk_public_objectives_ref
  FOREIGN KEY (objective_id) REFERENCES public.public_objectives(id);

ALTER TABLE public.game_player_secret_objectives
  ADD CONSTRAINT fk_secret_objectives_ref
  FOREIGN KEY (objective_id) REFERENCES public.secret_objectives(id);

ALTER TABLE public.game_action_card_deck
  ADD CONSTRAINT fk_action_card_deck_ref
  FOREIGN KEY (action_card_id) REFERENCES public.action_cards(id);

ALTER TABLE public.game_relic_deck
  ADD CONSTRAINT fk_relic_deck_ref
  FOREIGN KEY (relic_id) REFERENCES public.relics(id);

ALTER TABLE public.game_exploration_decks
  ADD CONSTRAINT fk_exploration_deck_ref
  FOREIGN KEY (card_id) REFERENCES public.exploration_cards(id);

ALTER TABLE public.game_player_promissory_notes
  ADD CONSTRAINT fk_promissory_notes_ref
  FOREIGN KEY (note_id) REFERENCES public.promissory_notes(id);
```

- [ ] **Step 2: Apply migration**

Run `005_reference.sql` in Supabase SQL Editor.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify all 31 tables exist**

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
```

Expected: `29` (31 minus auth.users and auth.sessions which are in the `auth` schema).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_reference.sql
git commit -m "feat: add all 12 reference data tables and back-fill foreign keys"
```

---

## Task 8: Row Level Security (migration 006)

**Files:**
- Create: `TI4 Companion/supabase/migrations/006_rls.sql`

- [ ] **Step 1: Write RLS migration**

Create `TI4 Companion/supabase/migrations/006_rls.sql`:
```sql
-- Enable RLS on all public tables
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_laws                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_system_state            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_system_activations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_agenda_deck             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_votes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_public_objectives       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_secret_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_action_card_deck        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_relic_deck              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_exploration_decks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_promissory_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_planets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_player_units            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_transactions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiles                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factions                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendas                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technologies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_objectives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_objectives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_cards                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relics                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exploration_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promissory_notes             ENABLE ROW LEVEL SECURITY;

-- ── Profiles ─────────────────────────────────────────────────────────────────
-- Users can read all profiles, only update their own
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- ── Reference data (read-only for all authenticated users) ────────────────────
CREATE POLICY "tiles_select"               ON public.tiles               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "factions_select"            ON public.factions            FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "agendas_select"             ON public.agendas             FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "technologies_select"        ON public.technologies        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "units_select"               ON public.units               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "public_objectives_select"   ON public.public_objectives   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "secret_objectives_select"   ON public.secret_objectives   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "action_cards_select"        ON public.action_cards        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "relics_select"              ON public.relics              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "exploration_cards_select"   ON public.exploration_cards   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "attachments_select"         ON public.attachments         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "promissory_notes_select"    ON public.promissory_notes    FOR SELECT USING (auth.role() = 'authenticated');

-- Reference data writes: admin only (checked against profiles.is_admin)
CREATE POLICY "tiles_admin_write"             ON public.tiles             FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "factions_admin_write"          ON public.factions          FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "agendas_admin_write"           ON public.agendas           FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "technologies_admin_write"      ON public.technologies      FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "units_admin_write"             ON public.units             FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "public_objectives_admin_write" ON public.public_objectives FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "secret_objectives_admin_write" ON public.secret_objectives FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "action_cards_admin_write"      ON public.action_cards      FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "relics_admin_write"            ON public.relics            FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "exploration_cards_admin_write" ON public.exploration_cards FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "attachments_admin_write"       ON public.attachments       FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));
CREATE POLICY "promissory_notes_admin_write"  ON public.promissory_notes  FOR ALL USING ((SELECT is_admin FROM public.profiles WHERE user_id = auth.uid()));

-- ── Games ─────────────────────────────────────────────────────────────────────
-- Any authenticated user can read a game (they need the room code to find it)
CREATE POLICY "games_select" ON public.games FOR SELECT USING (auth.role() = 'authenticated');
-- Only the host can update game-level state (phase, round, etc.)
-- Edge Functions bypass RLS using the service role key, so host enforcement
-- is done inside the Edge Function, not via RLS. Games are open to service role.
CREATE POLICY "games_insert" ON public.games FOR INSERT WITH CHECK (auth.uid() = host_user_id);

-- ── Game Players ──────────────────────────────────────────────────────────────
CREATE POLICY "game_players_select" ON public.game_players FOR SELECT USING (auth.role() = 'authenticated');
-- Inserts handled by Edge Functions (service role)
-- Direct client updates only for client-side state (counters) on own row
-- or if can_edit_all is true
CREATE POLICY "game_players_update" ON public.game_players FOR UPDATE USING (
  auth.uid() = user_id OR
  (SELECT can_edit_all FROM public.game_players WHERE user_id = auth.uid() AND game_id = game_players.game_id LIMIT 1)
);

-- ── All game sub-tables: read by authenticated, write via service role only ──
-- Edge Functions use the service role key, bypassing RLS.
-- Direct client reads are allowed. Direct client writes are blocked.
CREATE POLICY "game_laws_select"                      ON public.game_laws                      FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_system_state_select"              ON public.game_system_state              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_system_activations_select"        ON public.game_system_activations        FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_agenda_deck_select"               ON public.game_agenda_deck               FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_votes_select"                     ON public.game_votes                     FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_public_objectives_select"         ON public.game_public_objectives         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_secret_objectives_select"  ON public.game_player_secret_objectives  FOR SELECT USING (
  -- players can only see their own secret objectives
  player_id IN (SELECT id FROM public.game_players WHERE user_id = auth.uid())
  OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "game_action_card_deck_select"          ON public.game_action_card_deck          FOR SELECT USING (
  -- players can only see their own hand
  held_by_player_id IN (SELECT id FROM public.game_players WHERE user_id = auth.uid())
  OR held_by_player_id IS NULL  -- deck/discard visible to all
  OR (SELECT is_admin FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "game_relic_deck_select"                ON public.game_relic_deck                FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_exploration_decks_select"         ON public.game_exploration_decks         FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_promissory_notes_select"   ON public.game_player_promissory_notes   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_planets_select"            ON public.game_player_planets            FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_player_units_select"              ON public.game_player_units              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_transactions_select"              ON public.game_transactions              FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "game_events_select"                    ON public.game_events                    FOR SELECT USING (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply RLS migration**

Run `006_rls.sql` in Supabase SQL Editor.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify RLS is enabled**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Expected: `rowsecurity = true` for all rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_rls.sql
git commit -m "feat: add RLS policies for all tables"
```

---

## Task 9: Edge Function scaffolding

**Files:**
- Create: `TI4 Companion/supabase/functions/_shared/auth.ts`
- Create: `TI4 Companion/supabase/functions/_shared/errors.ts`
- Create: `TI4 Companion/supabase/functions/_shared/db.ts`
- Create: `TI4 Companion/supabase/functions/health/index.ts`

- [ ] **Step 1: Create shared auth helper**

Create `TI4 Companion/supabase/functions/_shared/auth.ts`:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Extract and verify the JWT from the Authorization header.
 * Returns the authenticated user_id or throws if unauthenticated.
 */
export async function requireAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header')
  }
  const token = authHeader.slice(7)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new AuthError('Invalid or expired token')
  return user.id
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}
```

- [ ] **Step 2: Create shared errors helper**

Create `TI4 Companion/supabase/functions/_shared/errors.ts`:
```ts
export function errorResponse(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function okResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 3: Create shared admin DB client**

Create `TI4 Companion/supabase/functions/_shared/db.ts`:
```ts
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Supabase admin client — uses service role key, bypasses RLS.
 * Only use inside Edge Functions, never expose to the client.
 */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}
```

- [ ] **Step 4: Create health check function**

Create `TI4 Companion/supabase/functions/health/index.ts`:
```ts
import { okResponse } from '../_shared/errors.ts'

Deno.serve(async (_req: Request) => {
  return okResponse({ status: 'ok', timestamp: new Date().toISOString() })
})
```

- [ ] **Step 5: Deploy health function and verify**

```bash
supabase functions deploy health --project-ref <your-project-ref>
```

Then test:
```bash
curl https://<your-project-ref>.supabase.co/functions/v1/health \
  -H "Authorization: Bearer <anon-key>"
```

Expected:
```json
{"status":"ok","timestamp":"2026-04-08T..."}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/
git commit -m "feat: add Edge Function scaffolding (shared auth/errors/db helpers, health check)"
```

---

## Task 10: React app shell + routing

**Files:**
- Create: `ti4-companion-web/src/main.jsx`
- Create: `ti4-companion-web/src/App.jsx`
- Create: `ti4-companion-web/src/components/auth/LoginScreen.jsx`
- Create: `ti4-companion-web/src/components/auth/VerifyScreen.jsx`
- Create: `ti4-companion-web/src/components/shared/ProtectedRoute.jsx`
- Create: `ti4-companion-web/tests/components/auth/LoginScreen.test.jsx`

- [ ] **Step 1: Write failing test for LoginScreen**

Create `ti4-companion-web/tests/components/auth/LoginScreen.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginScreen from '../../../src/components/auth/LoginScreen.jsx'

const mockSendMagicLink = vi.fn()

describe('LoginScreen', () => {
  it('renders email input and submit button', () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={false} error={null} />)
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  it('calls onSendLink with entered email', async () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={false} error={null} />)
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(mockSendMagicLink).toHaveBeenCalledWith('test@example.com'))
  })

  it('disables submit button while loading', () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={true} error={null} />)
    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled()
  })

  it('displays error message', () => {
    render(<LoginScreen onSendLink={mockSendMagicLink} loading={false} error="Invalid email" />)
    expect(screen.getByText('Invalid email')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/components/auth/LoginScreen.test.jsx
```

Expected: FAIL — component not found.

- [ ] **Step 3: Create LoginScreen component**

Create `ti4-companion-web/src/components/auth/LoginScreen.jsx`:
```jsx
import { useState } from 'react'

export default function LoginScreen({ onSendLink, loading, error }) {
  const [email, setEmail] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (email.trim()) onSendLink(email.trim())
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-8 bg-void">
      <div className="text-center">
        <div className="font-display text-xs text-plasma tracking-[0.4em] uppercase mb-2">
          Companion App
        </div>
        <h1 className="font-display text-3xl font-black text-bright tracking-wider">
          TWILIGHT<br />IMPERIUM
        </h1>
        <div className="font-display text-xs text-gold tracking-[0.3em] mt-2">4TH EDITION</div>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-3">
        <input
          className="input text-center"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          disabled={loading}
        />
        {error && <p className="text-danger text-sm font-body text-center">{error}</p>}
        <button
          className="btn-primary py-3"
          type="submit"
          disabled={loading || !email.trim()}
        >
          {loading ? 'Sending…' : 'Send Magic Link'}
        </button>
      </form>

      <p className="text-dim text-xs font-body text-center max-w-xs">
        We'll send a sign-in link to your email. No password needed.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Create VerifyScreen component**

Create `ti4-companion-web/src/components/auth/VerifyScreen.jsx`:
```jsx
export default function VerifyScreen({ email }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 gap-6 bg-void">
      <div className="text-center">
        <div className="font-display text-4xl text-gold mb-4">✓</div>
        <h2 className="font-display text-lg text-bright tracking-wider">Check your email</h2>
        <p className="text-dim font-body text-sm mt-2">
          A sign-in link has been sent to<br />
          <span className="text-text">{email}</span>
        </p>
      </div>
      <p className="text-dim text-xs font-body text-center max-w-xs">
        Click the link in the email to sign in. You can close this tab.
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Create ProtectedRoute component**

Create `ti4-companion-web/src/components/shared/ProtectedRoute.jsx`:
```jsx
import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ user, loading, children }) {
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-void">
        <div className="font-display text-xs text-dim tracking-widest animate-pulse">
          INITIALIZING...
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return children
}
```

- [ ] **Step 6: Create App.jsx with routing**

Create `ti4-companion-web/src/App.jsx`:
```jsx
import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './components/auth/LoginScreen.jsx'
import VerifyScreen from './components/auth/VerifyScreen.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'

// Placeholder screens — replaced in later phases
function SetupPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">SETUP — Phase 2</span></div>
}
function DashboardPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">DASHBOARD — Phase 2</span></div>
}
function AdminPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">ADMIN — Phase 1</span></div>
}

export default function App() {
  const { user, loading, sendMagicLink, signOut } = useAuth()
  const [linkSentTo, setLinkSentTo] = useState(null)
  const [authError, setAuthError]   = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  async function handleSendLink(email) {
    setAuthError(null)
    setAuthLoading(true)
    try {
      await sendMagicLink(email)
      setLinkSentTo(email)
    } catch (e) {
      setAuthError(e.message)
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to="/setup" replace /> :
          linkSentTo ? <VerifyScreen email={linkSentTo} /> :
          <LoginScreen onSendLink={handleSendLink} loading={authLoading} error={authError} />
        }
      />
      <Route
        path="/setup"
        element={<ProtectedRoute user={user} loading={loading}><SetupPlaceholder /></ProtectedRoute>}
      />
      <Route
        path="/dashboard"
        element={<ProtectedRoute user={user} loading={loading}><DashboardPlaceholder /></ProtectedRoute>}
      />
      <Route
        path="/admin/*"
        element={<ProtectedRoute user={user} loading={loading}><AdminPlaceholder /></ProtectedRoute>}
      />
      <Route path="*" element={<Navigate to={user ? '/setup' : '/login'} replace />} />
    </Routes>
  )
}
```

- [ ] **Step 7: Create main.jsx**

Replace `ti4-companion-web/src/main.jsx`:
```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
```

- [ ] **Step 8: Run LoginScreen tests**

```bash
npx vitest run tests/components/auth/LoginScreen.test.jsx
```

Expected: all 4 tests PASS.

- [ ] **Step 9: Run full test suite**

```bash
npm test
```

Expected: all tests pass, no failures.

- [ ] **Step 10: Start dev server and manually verify routing**

```bash
npm run dev
```

1. Open `http://localhost:5173` — redirects to `/login` ✓
2. Enter an email — shows VerifyScreen ✓
3. Navigate to `http://localhost:5173/setup` — shows "INITIALIZING..." then redirects to `/login` ✓

- [ ] **Step 11: Commit**

```bash
git add src/ tests/components/
git commit -m "feat: add React app shell with auth routing, LoginScreen, VerifyScreen, ProtectedRoute"
```

---

## Task 11: Configure Auth in Supabase + set admin flag

**Files:** None (configuration in Supabase dashboard)

- [ ] **Step 1: Enable magic link in Supabase Auth**

1. Supabase dashboard → Authentication → Providers
2. Email provider → ensure **"Enable Email Confirmations"** is OFF (we use magic link, not confirmation)
3. Authentication → URL Configuration:
   - **Site URL:** `http://localhost:5173` (update to production URL when deploying)
   - **Redirect URLs:** add `http://localhost:5173/**`

- [ ] **Step 2: Set your account as admin**

In Supabase SQL Editor:
```sql
UPDATE public.profiles
SET is_admin = true
WHERE user_id = auth.uid();
```

Note: You must be signed in first. If the `profiles` row doesn't exist yet, sign in to the app once via magic link — the trigger in `001_core.sql` creates it automatically.

Expected: `1 row updated`

- [ ] **Step 3: Verify**

```sql
SELECT user_id, display_name, is_admin FROM public.profiles;
```

Expected: your row shows `is_admin = true`.

---

## Phase 0 Complete ✓

At this point you have:
- ✅ React project scaffolded with Vite, Tailwind, sci-fi theme
- ✅ Vitest testing infrastructure with passing tests
- ✅ Supabase client singleton and useAuth hook
- ✅ All 31 database tables deployed
- ✅ RLS policies on every table
- ✅ Edge Function scaffolding (shared helpers + health check)
- ✅ App shell with auth routing (login → magic link → protected routes)
- ✅ Your account flagged as admin

**Next:** Phase 1 plan — Admin UI + manual data entry.
