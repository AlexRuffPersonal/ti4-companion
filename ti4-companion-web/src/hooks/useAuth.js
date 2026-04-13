import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export function useAuth() {
  const [user, setUser] = useState(null)
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
    // onAuthStateChange is registered FIRST so it catches the SIGNED_IN
    // event the SDK emits when it parses the #access_token= hash on load
    // (implicit flow). It is also the sole owner of setLoading(false).
    //
    // Why getSession() was removed:
    //   getSession() resolves null immediately, before the hash is parsed.
    //   The old code chained .finally(() => setLoading(false)) onto it, so
    //   loading went false while user was still null. The catch-all route in
    //   App.jsx then fired <Navigate to="/login">, which hard-replaced the
    //   URL and stripped the #access_token= hash entirely — so Supabase
    //   never got to process it. Removing getSession() here (and guarding
    //   the catch-all route on `loading` in App.jsx) closes that race.
    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        loadSession(session).finally(() => setLoading(false))
      })

    return () => subscription.unsubscribe()
  }, [])

  async function sendMagicLink(email) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
      },
    })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return { user, isAdmin, loading, sendMagicLink, signOut }
}
