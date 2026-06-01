// tests/helpers/mockDb.js
import { vi } from 'vitest'

const r = (data, error = null) => vi.fn().mockResolvedValue({ data, error })

// .select().eq().maybeSingle()
export function eqSingle(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: r(data, error),
      }),
    }),
  }
}

// .select().eq().eq().maybeSingle()
export function eqEqSingle(data, error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: r(data, error),
        }),
      }),
    }),
  }
}

// .select().eq() → resolves array
export function eqMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data, error }),
    }),
  }
}

// .select().eq().eq() → resolves array
export function eqEqMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  }
}

// .select().eq().eq().eq() → resolves array
export function eqEqEqMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  }
}

// .select().in() → resolves array
export function inMany(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      in: vi.fn().mockResolvedValue({ data, error }),
    }),
  }
}

// .select().eq().is() → resolves array
export function eqIs(data = [], error = null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        is: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  }
}

// Fallback for any table not explicitly registered.
// Uses mockImplementation so each level is created on demand, avoiding infinite recursion.
function nullSafeChain() {
  return {
    select: vi.fn().mockImplementation(() => nullSafeChain()),
    eq: vi.fn().mockImplementation(() => nullSafeChain()),
    is: vi.fn().mockResolvedValue({ data: null, error: null }),
    in: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    update: vi.fn().mockImplementation(() => nullSafeChain()),
    upsert: vi.fn().mockImplementation(() => nullSafeChain()),
    delete: vi.fn().mockImplementation(() => nullSafeChain()),
  }
}

/**
 * Wire up db.from with per-table mock shapes.
 * Tables not listed in overrides fall through to nullSafeChain(),
 * which returns null/[] for any query chain — new DB queries
 * added to handlers do not break tests that don't care about them.
 *
 * Usage:
 *   buildDbMock(db, {
 *     game_players: () => eqEqSingle({ id: PLAYER_ID }),
 *     games:        () => eqSingle({ id: GAME_ID }),
 *   })
 */
export function buildDbMock(db, overrides = {}) {
  db.from.mockImplementation((table) => overrides[table]?.() ?? nullSafeChain())
}
