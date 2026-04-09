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
