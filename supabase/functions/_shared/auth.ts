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
