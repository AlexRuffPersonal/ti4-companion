import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { db } from './db.ts'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Extract and verify the JWT from the Authorization header.
 * Creates a per-request Supabase client with the user's JWT so that
 * auth.getUser() verifies against the correct token without conflicting
 * with a module-level singleton's own auth state.
 * Returns the authenticated user_id or throws AuthError if invalid.
 */
export async function requireAuth(req: Request): Promise<string> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header')
  }

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new AuthError('Invalid or expired token')
  return user.id
}

/**
 * Verifies the Authorization header contains a valid service role key by
 * attempting a privileged DB query. Bypasses string comparison issues between
 * the caller's key and the injected env var.
 * Throws AuthError if the key is missing or cannot access protected data.
 */
export async function requireServiceRole(req: Request): Promise<void> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header')
  }
  const token = authHeader.slice(7).trim()
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    token,
    { auth: { persistSession: false } }
  )
  // profiles has RLS — only service role key can query it without a user context
  const { error } = await client.from('profiles').select('user_id').limit(1)
  if (error) {
    throw new AuthError('Forbidden: invalid service key')
  }
}

/**
 * Verifies it is the caller's turn to act.
 * Allows a host to act on behalf of a bot player.
 * Throws AuthError if the caller is not the active player (or authorized host acting for a bot).
 */
export function requireTurnAuth(
  game: Record<string, unknown>,
  callerPlayer: Record<string, unknown>,
  activePlayer: Record<string, unknown>
): void {
  // Normal human turn
  if (callerPlayer.id === game.active_player_id) return
  // Host acting for a bot
  if (activePlayer.is_bot && callerPlayer.id === game.host_player_id) return
  throw new AuthError('Not your turn')
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
  if (error) {
    throw new Error(`Admin check failed: ${error.message}`)
  }
  if (!data?.is_admin) {
    throw new AuthError('Forbidden: admin access required')
  }
  return userId
}
