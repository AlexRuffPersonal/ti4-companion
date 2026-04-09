import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
