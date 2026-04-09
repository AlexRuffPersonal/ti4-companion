# Phase 1: Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected admin UI with per-table JSON import for all 12 reference data tables, gated by `profiles.is_admin` at both the React route level and each Edge Function.

**Architecture:** `useAuth` is extended to load `isAdmin` on session init; a new `AdminRoute` component guards `/admin/*` routes client-side; 12 Edge Functions (`admin-import-<table>`) each validate the payload, truncate the table, and bulk-insert in sequence. The React import page (`AdminImportPage`) is shared across all 12 tables via a `:table` URL param.

**Tech Stack:** React 19, Vite, Tailwind CSS 3, Supabase JS v2, react-router-dom v7, Vitest 4, @testing-library/react, TypeScript/Deno (Edge Functions), Supabase CLI

---

## File Map

**Modified:**
- `supabase/functions/_shared/auth.ts` — add `requireAdmin(req)`
- `ti4-companion-web/src/hooks/useAuth.js` — add `isAdmin` state, fetch profiles row
- `ti4-companion-web/src/lib/edgeFunctions.js` — add `importTable(table, records)`
- `ti4-companion-web/src/App.jsx` — replace `AdminPlaceholder` with real admin routes
- `CLAUDE.md` — update tech stack versions and phase status

**Created (Edge Functions):**
- `supabase/functions/admin-import-tiles/index.ts`
- `supabase/functions/admin-import-factions/index.ts`
- `supabase/functions/admin-import-agendas/index.ts`
- `supabase/functions/admin-import-action-cards/index.ts`
- `supabase/functions/admin-import-technologies/index.ts`
- `supabase/functions/admin-import-units/index.ts`
- `supabase/functions/admin-import-public-objectives/index.ts`
- `supabase/functions/admin-import-secret-objectives/index.ts`
- `supabase/functions/admin-import-relics/index.ts`
- `supabase/functions/admin-import-exploration-cards/index.ts`
- `supabase/functions/admin-import-attachments/index.ts`
- `supabase/functions/admin-import-promissory-notes/index.ts`

**Created (React):**
- `ti4-companion-web/src/components/admin/AdminRoute.jsx`
- `ti4-companion-web/src/components/admin/AdminDashboard.jsx`
- `ti4-companion-web/src/components/admin/AdminImportPage.jsx`

**Created (Tests):**
- `ti4-companion-web/tests/hooks/useAuth.test.jsx`
- `ti4-companion-web/tests/components/admin/AdminRoute.test.jsx`
- `ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx`

---

## Task 0: Pre-work — consolidate git repos and update CLAUDE.md

**Files:** `.gitignore` (root), `CLAUDE.md`

This project has two git repos: one at the root tracking `supabase/`, and one inside `ti4-companion-web/` tracking the React app. Consolidate them before starting any Phase 1 work.

- [ ] **Step 1: Remove the inner git repo**

Run from `TI4 Companion/`:
```bash
rm -rf ti4-companion-web/.git
```

Expected: `ti4-companion-web/.git` directory is gone. `ti4-companion-web/` now appears as untracked in the root repo.

- [ ] **Step 2: Stage and commit the React app into the root repo**

```bash
cd "TI4 Companion"
git add ti4-companion-web/
git status
```

Expected: `ti4-companion-web/` files appear as new files staged in the root repo.

```bash
git commit -m "chore: absorb React web app into root repo"
```

Expected: commit created, root repo now tracks both `supabase/` and `ti4-companion-web/`.

- [ ] **Step 3: Add .superpowers to .gitignore**

Check if a `.gitignore` exists at the root:
```bash
cat .gitignore 2>/dev/null || echo "no .gitignore"
```

Add `.superpowers/` to the root `.gitignore` (create the file if it doesn't exist):
```
.superpowers/
```

Also check `ti4-companion-web/.gitignore` and add `.superpowers/` if not already listed.

- [ ] **Step 4: Update CLAUDE.md tech stack section**

In `CLAUDE.md`, find the React Web App section and replace:
```
React 18, Vite, Tailwind CSS 3, Supabase JS v2, react-router-dom v6, Vitest, @testing-library/react
```
with:
```
React 19, Vite, Tailwind CSS 3, Supabase JS v2, react-router-dom v7, Vitest 4, @testing-library/react
```

Also replace the Project Overview paragraph:
```
None of the platforms have been scaffolded yet. The React web app is being built first (Phase 0). See `ti4-companion-web/docs/superpowers/plans/2026-04-08-phase-0-infrastructure.md` for the implementation plan.
```
with:
```
Phase 0 (infrastructure) is complete. Phase 1 (Admin UI) is in progress. See `ti4-companion-web/docs/superpowers/plans/` for implementation plans.
```

Also update the "Planned Key Files (not yet created)" section header to "Key Files":
```markdown
### Key Files
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore ti4-companion-web/.gitignore CLAUDE.md
git commit -m "chore: update CLAUDE.md versions, add .superpowers to gitignore"
```

---

## Task 1: Add `requireAdmin` to `_shared/auth.ts`

**Files:**
- Modify: `supabase/functions/_shared/auth.ts`

The existing `requireAuth` validates the JWT and returns `user_id`. `requireAdmin` wraps it and additionally checks `profiles.is_admin`. It throws `AuthError` with message "Forbidden: admin access required" (403) vs other AuthErrors (401). All 12 Edge Functions call `requireAdmin`.

- [ ] **Step 1: Modify `supabase/functions/_shared/auth.ts`**

Replace the entire file:
```typescript
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { db } from './db.ts'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

// Module-level singleton — one client per cold start, not per request.
const _authClient: SupabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
)

/**
 * Extract and verify the JWT from the Authorization header.
 * Returns the authenticated user_id or throws AuthError if invalid.
 */
export async function requireAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header')
  }
  const token = authHeader.slice(7)
  const { data: { user }, error } = await _authClient.auth.getUser(token)
  if (error || !user) throw new AuthError('Invalid or expired token')
  return user.id
}

/**
 * Like requireAuth, but also verifies profiles.is_admin === true.
 * Throws AuthError with "Forbidden:" prefix for 403 vs 401.
 */
export async function requireAdmin(req: Request): Promise<string> {
  const userId = await requireAuth(req)
  const { data, error } = await db
    .from('profiles')
    .select('is_admin')
    .eq('user_id', userId)
    .single()
  if (error || !data?.is_admin) {
    throw new AuthError('Forbidden: admin access required')
  }
  return userId
}
```

- [ ] **Step 2: Verify the file is valid TypeScript**

```bash
cd "TI4 Companion"
npx supabase functions serve health --no-verify-jwt 2>&1 | head -5
```

Expected: no TypeScript errors from the `_shared/` imports (the health function imports from `_shared/errors.ts` and will trigger compilation of the shared module).

Alternatively, if you have Deno installed:
```bash
deno check supabase/functions/_shared/auth.ts
```

Expected: "Check file:///.../_shared/auth.ts" with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/auth.ts
git commit -m "feat: add requireAdmin to _shared/auth.ts"
```

---

## Task 2: Extend `useAuth` with `isAdmin` + write tests

**Files:**
- Modify: `ti4-companion-web/src/hooks/useAuth.js`
- Create: `ti4-companion-web/tests/hooks/useAuth.test.jsx`

`useAuth` currently returns `{ user, loading, sendMagicLink, signOut }`. It needs to also return `isAdmin` (boolean). When a session is established, fetch `profiles.is_admin` for the current user immediately. When there's no session, `isAdmin` is `false`.

- [ ] **Step 1: Create the test file**

Create `ti4-companion-web/tests/hooks/useAuth.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../../src/hooks/useAuth.js'

vi.mock('../../src/lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signInWithOtp: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}))

import { supabase } from '../../src/lib/supabase.js'

describe('useAuth — isAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
  })

  it('returns isAdmin: false when there is no session', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } })

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(false)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns isAdmin: true when profiles.is_admin is true', async () => {
    const mockUser = { id: 'user-admin' }
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } },
    })
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { is_admin: true }, error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(true)
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-admin')
  })

  it('returns isAdmin: false when profiles.is_admin is false', async () => {
    const mockUser = { id: 'user-regular' }
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } },
    })
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { is_admin: false }, error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(false)
  })

  it('returns isAdmin: false when profiles fetch fails', async () => {
    const mockUser = { id: 'user-broken' }
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } },
    })
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }
    supabase.from.mockReturnValue(mockChain)

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isAdmin).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd "TI4 Companion/ti4-companion-web"
npx vitest run tests/hooks/useAuth.test.jsx
```

Expected: FAIL — `result.current.isAdmin` is undefined (hook doesn't expose it yet).

- [ ] **Step 3: Update `useAuth.js`**

Replace `ti4-companion-web/src/hooks/useAuth.js`:
```javascript
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export function useAuth() {
  const [user, setUser]       = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadSession(session) {
    const sessionUser = session?.user ?? null
    setUser(sessionUser)
    if (sessionUser) {
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('user_id', sessionUser.id)
        .single()
      setIsAdmin(data?.is_admin ?? false)
    } else {
      setIsAdmin(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => loadSession(session))
      .catch(() => { setUser(null); setIsAdmin(false) })
      .finally(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadSession(session)
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

  return { user, isAdmin, loading, sendMagicLink, signOut }
}
```

- [ ] **Step 4: Run the tests — verify they pass**

```bash
npx vitest run tests/hooks/useAuth.test.jsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all tests pass (previous 7 + 4 new = 11 total).

- [ ] **Step 6: Commit**

```bash
cd "TI4 Companion"
git add ti4-companion-web/src/hooks/useAuth.js ti4-companion-web/tests/hooks/useAuth.test.jsx
git commit -m "feat: extend useAuth with isAdmin from profiles"
```

---

## Task 3: `AdminRoute` component + tests

**Files:**
- Create: `ti4-companion-web/src/components/admin/AdminRoute.jsx`
- Create: `ti4-companion-web/tests/components/admin/AdminRoute.test.jsx`

`AdminRoute` calls `useAuth()` internally (no prop drilling). While `loading` is true, renders `null`. If no session, redirects to `/login`. If session but `isAdmin` is false, redirects to `/`. Otherwise renders `children`.

- [ ] **Step 1: Create the test file**

Create `ti4-companion-web/tests/components/admin/AdminRoute.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AdminRoute from '../../../src/components/admin/AdminRoute.jsx'

vi.mock('../../../src/hooks/useAuth.js', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../../src/hooks/useAuth.js'

function renderWithRouter(authState, initialPath = '/admin') {
  useAuth.mockReturnValue(authState)
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/" element={<div>Home page</div>} />
        <Route
          path="/admin"
          element={<AdminRoute><div>Admin content</div></AdminRoute>}
        />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminRoute', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing while loading', () => {
    const { container } = renderWithRouter({ user: null, isAdmin: false, loading: true })
    expect(container.firstChild).toBeNull()
  })

  it('redirects to /login when there is no session', () => {
    renderWithRouter({ user: null, isAdmin: false, loading: false })
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('redirects to / when session exists but user is not admin', () => {
    renderWithRouter({ user: { id: 'user-1' }, isAdmin: false, loading: false })
    expect(screen.getByText('Home page')).toBeInTheDocument()
    expect(screen.queryByText('Admin content')).not.toBeInTheDocument()
  })

  it('renders children when session exists and user is admin', () => {
    renderWithRouter({ user: { id: 'user-1' }, isAdmin: true, loading: false })
    expect(screen.getByText('Admin content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd "TI4 Companion/ti4-companion-web"
npx vitest run tests/components/admin/AdminRoute.test.jsx
```

Expected: FAIL — `AdminRoute` module not found.

- [ ] **Step 3: Create `AdminRoute.jsx`**

Create `ti4-companion-web/src/components/admin/AdminRoute.jsx`:
```jsx
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.js'

export default function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}
```

- [ ] **Step 4: Run the tests — verify they pass**

```bash
npx vitest run tests/components/admin/AdminRoute.test.jsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd "TI4 Companion"
git add ti4-companion-web/src/components/admin/AdminRoute.jsx ti4-companion-web/tests/components/admin/AdminRoute.test.jsx
git commit -m "feat: add AdminRoute — guards /admin/* routes by isAdmin"
```

---

## Task 4: `admin-import-tiles` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-tiles/index.ts`

**Pattern for all 12 Edge Functions:** call `requireAdmin` → validate payload → delete all rows → insert new rows → return `{imported: N}`. This task explains the pattern in full. Tasks 5–15 follow the same structure with table-specific code.

**Note on atomicity:** Delete and insert are separate operations (no true transaction via the JS client). If insert fails after delete, the table is empty until re-imported. For an infrequent admin operation this is acceptable.

**Prerequisite: local Supabase must be running for testing.**
```bash
cd "TI4 Companion"
npx supabase start
```
Expected: local Supabase starts (may take ~30 seconds first run). Note the anon key and service role key printed in the output.

- [ ] **Step 1: Create `supabase/functions/admin-import-tiles/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

const VALID_TYPES = new Set(['blue', 'red', 'home', 'hyperlane', 'frontier'])

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.tile_number || typeof r.tile_number !== 'string')
    return `Record ${index}: missing or invalid 'tile_number'`
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (!r.type || typeof r.type !== 'string' || !VALID_TYPES.has(r.type as string))
    return `Record ${index}: 'type' must be one of: blue, red, home, hyperlane, frontier`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid JSON body')
  }

  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('tiles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('tiles').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Serve the function locally**

```bash
cd "TI4 Companion"
npx supabase functions serve admin-import-tiles
```

Leave this running in a separate terminal. The function is served at `http://localhost:54321/functions/v1/admin-import-tiles`.

- [ ] **Step 3: Test — 401 with no Authorization header**

```bash
curl -s -X POST http://localhost:54321/functions/v1/admin-import-tiles \
  -H "Content-Type: application/json" \
  -d '{"records":[]}' | jq .
```

Expected:
```json
{"error": "Missing or invalid Authorization header"}
```
HTTP status: 401

- [ ] **Step 4: Test — 400 with missing required field**

Get your admin user's JWT from Supabase Dashboard → Authentication → Users → your user → copy JWT. Export it:
```bash
export TOKEN="eyJ..."
```

```bash
curl -s -X POST http://localhost:54321/functions/v1/admin-import-tiles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Mecatol Rex","type":"blue"}]}' | jq .
```

Expected:
```json
{"error": "Record 1: missing or invalid 'tile_number'"}
```

- [ ] **Step 5: Test — 200 with valid payload**

```bash
curl -s -X POST http://localhost:54321/functions/v1/admin-import-tiles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"tile_number":"001","name":"Mecatol Rex","type":"blue"}]}' | jq .
```

Expected:
```json
{"imported": 1}
```

- [ ] **Step 6: Commit**

Stop the `supabase functions serve` process (Ctrl+C), then:
```bash
git add supabase/functions/admin-import-tiles/
git commit -m "feat: add admin-import-tiles Edge Function"
```

---

## Task 5: `admin-import-factions` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-factions/index.ts`

Required fields: `name` (TEXT, unique).

- [ ] **Step 1: Create `supabase/functions/admin-import-factions/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('factions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('factions').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-factions
```

In a second terminal:
```bash
# Missing name → 400
curl -s -X POST http://localhost:54321/functions/v1/admin-import-factions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"expansion":"base"}]}' | jq .
# Expected: {"error":"Record 1: missing or invalid 'name'"}

# Valid → 200
curl -s -X POST http://localhost:54321/functions/v1/admin-import-factions \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"The Barony of Letnev","expansion":"base"}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-factions/
git commit -m "feat: add admin-import-factions Edge Function"
```

---

## Task 6: `admin-import-agendas` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-agendas/index.ts`

Required fields: `name`, `type` (must be `law` or `directive`), `outcome`.

- [ ] **Step 1: Create `supabase/functions/admin-import-agendas/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

const VALID_TYPES = new Set(['law', 'directive'])

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (!r.type || typeof r.type !== 'string' || !VALID_TYPES.has(r.type as string))
    return `Record ${index}: 'type' must be one of: law, directive`
  if (!r.outcome || typeof r.outcome !== 'string')
    return `Record ${index}: missing or invalid 'outcome'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('agendas').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('agendas').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-agendas
```

```bash
# Invalid type → 400
curl -s -X POST http://localhost:54321/functions/v1/admin-import-agendas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Mutiny","type":"vote","outcome":"Player"}]}' | jq .
# Expected: {"error":"Record 1: 'type' must be one of: law, directive"}

# Valid → 200
curl -s -X POST http://localhost:54321/functions/v1/admin-import-agendas \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Mutiny","type":"law","outcome":"Player"}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-agendas/
git commit -m "feat: add admin-import-agendas Edge Function"
```

---

## Task 7: `admin-import-action-cards` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-action-cards/index.ts`

Required fields: `name`. Table name: `action_cards` (underscore). Function name: `admin-import-action-cards` (hyphen).

- [ ] **Step 1: Create `supabase/functions/admin-import-action-cards/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('action_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('action_cards').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-action-cards
```

```bash
# Missing name → 400
curl -s -X POST http://localhost:54321/functions/v1/admin-import-action-cards \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"timing":"Action"}]}' | jq .
# Expected: {"error":"Record 1: missing or invalid 'name'"}

# Valid → 200
curl -s -X POST http://localhost:54321/functions/v1/admin-import-action-cards \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Bribery","timing":"Action","quantity":2}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-action-cards/
git commit -m "feat: add admin-import-action-cards Edge Function"
```

---

## Task 8: `admin-import-technologies` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-technologies/index.ts`

Required fields: `name`, `colour` (must be `green`, `blue`, `red`, or `yellow`).

- [ ] **Step 1: Create `supabase/functions/admin-import-technologies/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

const VALID_COLOURS = new Set(['green', 'blue', 'red', 'yellow'])

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (!r.colour || typeof r.colour !== 'string' || !VALID_COLOURS.has(r.colour as string))
    return `Record ${index}: 'colour' must be one of: green, blue, red, yellow`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('technologies').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('technologies').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-technologies
```

```bash
# Invalid colour → 400
curl -s -X POST http://localhost:54321/functions/v1/admin-import-technologies \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Neural Motivator","colour":"purple"}]}' | jq .
# Expected: {"error":"Record 1: 'colour' must be one of: green, blue, red, yellow"}

# Valid → 200
curl -s -X POST http://localhost:54321/functions/v1/admin-import-technologies \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Neural Motivator","colour":"green"}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-technologies/
git commit -m "feat: add admin-import-technologies Edge Function"
```

---

## Task 9: `admin-import-units` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-units/index.ts`

Required fields: `name` (unique).

- [ ] **Step 1: Create `supabase/functions/admin-import-units/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('units').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('units').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-units
```

```bash
# Valid → 200
curl -s -X POST http://localhost:54321/functions/v1/admin-import-units \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Carrier","cost":3,"combat":null,"move":2,"capacity":4}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-units/
git commit -m "feat: add admin-import-units Edge Function"
```

---

## Task 10: `admin-import-public-objectives` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-public-objectives/index.ts`

Required fields: `name`, `stage` (integer), `condition`. Table name: `public_objectives`.

- [ ] **Step 1: Create `supabase/functions/admin-import-public-objectives/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (typeof r.stage !== 'number' || !Number.isInteger(r.stage))
    return `Record ${index}: 'stage' must be an integer`
  if (!r.condition || typeof r.condition !== 'string')
    return `Record ${index}: missing or invalid 'condition'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('public_objectives').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('public_objectives').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-public-objectives
```

```bash
# Missing stage → 400
curl -s -X POST http://localhost:54321/functions/v1/admin-import-public-objectives \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Spend 3 Influence","condition":"..."}]}' | jq .
# Expected: {"error":"Record 1: 'stage' must be an integer"}

# Valid → 200
curl -s -X POST http://localhost:54321/functions/v1/admin-import-public-objectives \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Spend 3 Influence","stage":1,"condition":"Spend 3 influence"}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-public-objectives/
git commit -m "feat: add admin-import-public-objectives Edge Function"
```

---

## Task 11: `admin-import-secret-objectives` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-secret-objectives/index.ts`

Required fields: `name`, `condition`. Table name: `secret_objectives`.

- [ ] **Step 1: Create `supabase/functions/admin-import-secret-objectives/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (!r.condition || typeof r.condition !== 'string')
    return `Record ${index}: missing or invalid 'condition'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('secret_objectives').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('secret_objectives').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-secret-objectives
```

```bash
curl -s -X POST http://localhost:54321/functions/v1/admin-import-secret-objectives \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Darken the Skies","condition":"Win a space combat..."}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-secret-objectives/
git commit -m "feat: add admin-import-secret-objectives Edge Function"
```

---

## Task 12: `admin-import-relics` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-relics/index.ts`

Required fields: `name`.

- [ ] **Step 1: Create `supabase/functions/admin-import-relics/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('relics').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('relics').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-relics
```

```bash
curl -s -X POST http://localhost:54321/functions/v1/admin-import-relics \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Scepter of Dominnus","exhaustable":true}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-relics/
git commit -m "feat: add admin-import-relics Edge Function"
```

---

## Task 13: `admin-import-exploration-cards` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-exploration-cards/index.ts`

Required fields: `name`, `deck_type` (must be `cultural`, `industrial`, `hazardous`, or `frontier`). Table name: `exploration_cards`.

- [ ] **Step 1: Create `supabase/functions/admin-import-exploration-cards/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

const VALID_DECK_TYPES = new Set(['cultural', 'industrial', 'hazardous', 'frontier'])

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  if (!r.deck_type || typeof r.deck_type !== 'string' || !VALID_DECK_TYPES.has(r.deck_type as string))
    return `Record ${index}: 'deck_type' must be one of: cultural, industrial, hazardous, frontier`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('exploration_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('exploration_cards').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-exploration-cards
```

```bash
# Invalid deck_type → 400
curl -s -X POST http://localhost:54321/functions/v1/admin-import-exploration-cards \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Relic Fragment","deck_type":"unknown"}]}' | jq .
# Expected: {"error":"Record 1: 'deck_type' must be one of: cultural, industrial, hazardous, frontier"}

# Valid → 200
curl -s -X POST http://localhost:54321/functions/v1/admin-import-exploration-cards \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Relic Fragment","deck_type":"cultural","quantity":3}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-exploration-cards/
git commit -m "feat: add admin-import-exploration-cards Edge Function"
```

---

## Task 14: `admin-import-attachments` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-attachments/index.ts`

Required fields: `name`.

- [ ] **Step 1: Create `supabase/functions/admin-import-attachments/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('attachments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('attachments').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-attachments
```

```bash
curl -s -X POST http://localhost:54321/functions/v1/admin-import-attachments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Terraform","planet_trait":"cultural","resource_modifier":1,"influence_modifier":1}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-attachments/
git commit -m "feat: add admin-import-attachments Edge Function"
```

---

## Task 15: `admin-import-promissory-notes` Edge Function

**Files:**
- Create: `supabase/functions/admin-import-promissory-notes/index.ts`

Required fields: `name`. Table name: `promissory_notes`.

- [ ] **Step 1: Create `supabase/functions/admin-import-promissory-notes/index.ts`**

```typescript
import { requireAdmin, AuthError } from '../_shared/auth.ts'
import { db } from '../_shared/db.ts'
import { okResponse, errorResponse } from '../_shared/errors.ts'

function validate(record: unknown, index: number): string | null {
  const r = record as Record<string, unknown>
  if (!r.name || typeof r.name !== 'string')
    return `Record ${index}: missing or invalid 'name'`
  return null
}

Deno.serve(async (req: Request) => {
  try {
    await requireAdmin(req)
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(e.message, e.message.startsWith('Forbidden') ? 403 : 401)
    }
    return errorResponse('Internal server error', 500)
  }

  let body: { records?: unknown }
  try { body = await req.json() } catch { return errorResponse('Invalid JSON body') }
  if (!Array.isArray(body.records)) return errorResponse("'records' must be an array")

  for (let i = 0; i < body.records.length; i++) {
    const err = validate(body.records[i], i + 1)
    if (err) return errorResponse(err)
  }

  const { error: deleteError } = await db.from('promissory_notes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (deleteError) return errorResponse(`Delete failed: ${deleteError.message}`, 500)

  const { error: insertError } = await db.from('promissory_notes').insert(body.records as object[])
  if (insertError) return errorResponse(`Insert failed: ${insertError.message}`, 500)

  return okResponse({ imported: (body.records as object[]).length })
})
```

- [ ] **Step 2: Test**

```bash
npx supabase functions serve admin-import-promissory-notes
```

```bash
curl -s -X POST http://localhost:54321/functions/v1/admin-import-promissory-notes \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"records":[{"name":"Ceasefire","faction":null,"returns_to_owner":true}]}' | jq .
# Expected: {"imported":1}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-import-promissory-notes/
git commit -m "feat: add admin-import-promissory-notes Edge Function"
```

---

## Task 16: Add `importTable` to `edgeFunctions.js`

**Files:**
- Modify: `ti4-companion-web/src/lib/edgeFunctions.js`

`importTable(table, records)` calls `admin-import-${table}` with the records payload. The `table` parameter is the hyphenated URL key (e.g., `action-cards`), which matches the Edge Function name directly.

- [ ] **Step 1: Modify `ti4-companion-web/src/lib/edgeFunctions.js`**

Replace the file:
```javascript
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

/**
 * Bulk-import records into a reference table via the admin Edge Function.
 * Replaces all existing records in the table.
 * @param {string} table - hyphenated table key (e.g. 'action-cards', 'tiles')
 * @param {object[]} records - array of record objects (no 'id' field needed)
 * @returns {Promise<{imported: number}>}
 */
export const importTable = (table, records) =>
  callFunction(`admin-import-${table}`, { records })

export { callFunction }
```

- [ ] **Step 2: Run the full test suite**

```bash
cd "TI4 Companion/ti4-companion-web"
npx vitest run
```

Expected: all tests pass (no tests import `edgeFunctions.js` directly, so no regressions).

- [ ] **Step 3: Commit**

```bash
cd "TI4 Companion"
git add ti4-companion-web/src/lib/edgeFunctions.js
git commit -m "feat: add importTable wrapper to edgeFunctions.js"
```

---

## Task 17: `AdminDashboard` component

**Files:**
- Create: `ti4-companion-web/src/components/admin/AdminDashboard.jsx`

Displays the 12 import buttons grouped into 4 categories. Each button navigates to `/admin/import/:table`.

- [ ] **Step 1: Create `ti4-companion-web/src/components/admin/AdminDashboard.jsx`**

```jsx
import { useNavigate } from 'react-router-dom'

const GROUPS = [
  {
    label: 'Map & Units',
    tables: [
      { name: 'Tiles', key: 'tiles' },
      { name: 'Units', key: 'units' },
      { name: 'Attachments', key: 'attachments' },
    ],
  },
  {
    label: 'Factions',
    tables: [
      { name: 'Factions', key: 'factions' },
      { name: 'Technologies', key: 'technologies' },
      { name: 'Promissory Notes', key: 'promissory-notes' },
    ],
  },
  {
    label: 'Cards & Agendas',
    tables: [
      { name: 'Agendas', key: 'agendas' },
      { name: 'Action Cards', key: 'action-cards' },
      { name: 'Exploration Cards', key: 'exploration-cards' },
      { name: 'Relics', key: 'relics' },
    ],
  },
  {
    label: 'Objectives',
    tables: [
      { name: 'Public Objectives', key: 'public-objectives' },
      { name: 'Secret Objectives', key: 'secret-objectives' },
    ],
  },
]

export default function AdminDashboard() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-void p-8">
      <h1 className="font-display text-bright text-xl tracking-widest mb-8">
        REFERENCE DATA
      </h1>
      <div className="flex flex-col gap-8">
        {GROUPS.map(({ label, tables }) => (
          <div key={label}>
            <div className="label mb-3">{label}</div>
            <div className="flex flex-wrap gap-3">
              {tables.map(({ name, key }) => (
                <button
                  key={key}
                  className="btn-ghost"
                  onClick={() => navigate(`/admin/import/${key}`)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it renders (smoke check)**

```bash
cd "TI4 Companion/ti4-companion-web"
npm run dev
```

Log in as your admin user, navigate to `/admin`. You should see the grouped import buttons.

Stop the dev server (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
cd "TI4 Companion"
git add ti4-companion-web/src/components/admin/AdminDashboard.jsx
git commit -m "feat: add AdminDashboard component"
```

---

## Task 18: `AdminImportPage` component + tests

**Files:**
- Create: `ti4-companion-web/src/components/admin/AdminImportPage.jsx`
- Create: `ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx`

The import page is shared across all 12 tables via the `:table` URL param. It reads the param, shows the table label, handles client-side JSON validation, calls `importTable`, and shows a success or error banner.

- [ ] **Step 1: Create the test file**

Create `ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AdminImportPage from '../../../src/components/admin/AdminImportPage.jsx'

vi.mock('../../../src/lib/edgeFunctions.js', () => ({
  importTable: vi.fn(),
  callFunction: vi.fn(),
}))

import { importTable } from '../../../src/lib/edgeFunctions.js'

function renderPage(table = 'tiles') {
  return render(
    <MemoryRouter initialEntries={[`/admin/import/${table}`]}>
      <Routes>
        <Route path="/admin/import/:table" element={<AdminImportPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('AdminImportPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows an error for invalid JSON without calling importTable', async () => {
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not json' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/invalid json/i)).toBeInTheDocument()
    )
    expect(importTable).not.toHaveBeenCalled()
  })

  it('shows an error when JSON is not an array without calling importTable', async () => {
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '{"name":"test"}' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/expected a json array/i)).toBeInTheDocument()
    )
    expect(importTable).not.toHaveBeenCalled()
  })

  it('shows success banner and clears textarea on successful import', async () => {
    importTable.mockResolvedValue({ imported: 5 })
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '[{"name":"test"}]' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/5 records imported/i)).toBeInTheDocument()
    )
    expect(screen.getByRole('textbox').value).toBe('')
  })

  it('shows error banner when importTable rejects', async () => {
    importTable.mockRejectedValue(new Error('Record 1: missing tile_number'))
    renderPage()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '[{"name":"test"}]' } })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() =>
      expect(screen.getByText(/record 1: missing tile_number/i)).toBeInTheDocument()
    )
  })

  it('passes the table key and parsed records to importTable', async () => {
    importTable.mockResolvedValue({ imported: 1 })
    renderPage('factions')
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '[{"name":"Letnev"}]' },
    })
    fireEvent.click(screen.getByRole('button', { name: /import/i }))
    await waitFor(() => expect(importTable).toHaveBeenCalledWith('factions', [{ name: 'Letnev' }]))
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

```bash
cd "TI4 Companion/ti4-companion-web"
npx vitest run tests/components/admin/AdminImportPage.test.jsx
```

Expected: FAIL — `AdminImportPage` module not found.

- [ ] **Step 3: Create `AdminImportPage.jsx`**

Create `ti4-companion-web/src/components/admin/AdminImportPage.jsx`:
```jsx
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { importTable } from '../../lib/edgeFunctions.js'

const TABLE_LABELS = {
  'tiles':               'Tiles',
  'factions':            'Factions',
  'agendas':             'Agendas',
  'action-cards':        'Action Cards',
  'technologies':        'Technologies',
  'units':               'Units',
  'public-objectives':   'Public Objectives',
  'secret-objectives':   'Secret Objectives',
  'relics':              'Relics',
  'exploration-cards':   'Exploration Cards',
  'attachments':         'Attachments',
  'promissory-notes':    'Promissory Notes',
}

export default function AdminImportPage() {
  const { table } = useParams()
  const [json, setJson]           = useState('')
  const [status, setStatus]       = useState(null) // null | { type: 'success'|'error', message: string }
  const [submitting, setSubmitting] = useState(false)

  const label = TABLE_LABELS[table] ?? table

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus(null)

    let records
    try {
      records = JSON.parse(json)
      if (!Array.isArray(records)) throw new Error('Expected a JSON array')
    } catch (err) {
      setStatus({ type: 'error', message: `Invalid JSON: ${err.message}` })
      return
    }

    setSubmitting(true)
    try {
      const { imported } = await importTable(table, records)
      setJson('')
      setStatus({
        type: 'success',
        message: `${imported} records imported. All existing ${label} records replaced.`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: `Import failed: ${err.message}` })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-void p-8 max-w-2xl">
      <Link to="/admin" className="label text-muted hover:text-text mb-6 inline-block">
        ← Back to Reference Data
      </Link>
      <h1 className="font-display text-bright text-xl tracking-widest mb-2">
        IMPORT {label.toUpperCase()}
      </h1>
      <p className="text-dim text-sm mb-6">
        Replaces all existing {label} records.
      </p>

      {status && (
        <div
          className={`panel-inset mb-6 text-sm ${
            status.type === 'success' ? 'text-success' : 'text-danger'
          }`}
        >
          {status.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <textarea
          className="input font-mono text-xs h-48 resize-y"
          placeholder={`[{"name": "...", ...}, ...]`}
          value={json}
          onChange={e => setJson(e.target.value)}
        />
        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Importing...' : `Import ${label}`}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests — verify they pass**

```bash
npx vitest run tests/components/admin/AdminImportPage.test.jsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd "TI4 Companion"
git add ti4-companion-web/src/components/admin/AdminImportPage.jsx \
        ti4-companion-web/tests/components/admin/AdminImportPage.test.jsx
git commit -m "feat: add AdminImportPage component with JSON validation"
```

---

## Task 19: Wire admin routes in `App.jsx`

**Files:**
- Modify: `ti4-companion-web/src/App.jsx`

Replace the `AdminPlaceholder` and the `/admin/*` `ProtectedRoute` with `AdminRoute` wrapping both `/admin` and `/admin/import/:table`. `AdminRoute` calls `useAuth()` internally, so `user` and `loading` do not need to be threaded through as props.

- [ ] **Step 1: Update `ti4-companion-web/src/App.jsx`**

Replace the entire file:
```jsx
import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './components/auth/LoginScreen.jsx'
import VerifyScreen from './components/auth/VerifyScreen.jsx'
import ProtectedRoute from './components/shared/ProtectedRoute.jsx'
import AdminRoute from './components/admin/AdminRoute.jsx'
import AdminDashboard from './components/admin/AdminDashboard.jsx'
import AdminImportPage from './components/admin/AdminImportPage.jsx'

// Placeholder screens — replaced in later phases
function SetupPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">SETUP — Phase 2</span></div>
}
function DashboardPlaceholder() {
  return <div className="min-h-screen bg-void flex items-center justify-center"><span className="text-dim font-display text-xs">DASHBOARD — Phase 2</span></div>
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
        path="/admin"
        element={<AdminRoute><AdminDashboard /></AdminRoute>}
      />
      <Route
        path="/admin/import/:table"
        element={<AdminRoute><AdminImportPage /></AdminRoute>}
      />
      <Route path="*" element={<Navigate to={user ? '/setup' : '/login'} replace />} />
    </Routes>
  )
}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd "TI4 Companion/ti4-companion-web"
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Smoke test in the browser**

```bash
npm run dev
```

1. Log in as admin user → navigate to `/admin` → verify grouped import buttons render
2. Click "Tiles" → verify you land on `/admin/import/tiles` with a textarea and Import button
3. Paste invalid JSON (e.g., `not json`) → click Import → verify inline error appears
4. Paste `[{"tile_number":"001","name":"Mecatol Rex","type":"blue"}]` → click Import → verify success banner: "1 records imported..."
5. Click "← Back to Reference Data" → verify navigation back to `/admin`
6. Log in as non-admin user → navigate to `/admin` → verify redirect to `/`

Stop the dev server (Ctrl+C).

- [ ] **Step 4: Deploy Edge Functions to production Supabase**

```bash
cd "TI4 Companion"
npx supabase functions deploy admin-import-tiles
npx supabase functions deploy admin-import-factions
npx supabase functions deploy admin-import-agendas
npx supabase functions deploy admin-import-action-cards
npx supabase functions deploy admin-import-technologies
npx supabase functions deploy admin-import-units
npx supabase functions deploy admin-import-public-objectives
npx supabase functions deploy admin-import-secret-objectives
npx supabase functions deploy admin-import-relics
npx supabase functions deploy admin-import-exploration-cards
npx supabase functions deploy admin-import-attachments
npx supabase functions deploy admin-import-promissory-notes
```

Expected: each function deploys with "Deployed Function <name>".

- [ ] **Step 5: Final commit**

```bash
git add ti4-companion-web/src/App.jsx
git commit -m "feat: wire AdminDashboard and AdminImportPage into App router"
```
