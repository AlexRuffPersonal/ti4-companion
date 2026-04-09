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
