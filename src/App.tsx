import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ALLOWED_EMAIL_DOMAIN, supabase } from './lib/supabase'
import SignIn from './components/SignIn'
import Planner from './components/Planner'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Errors from the Google redirect (e.g. a non-Hamilton account rejected by the database).
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
    const desc = params.get('error_description')
    if (desc) {
      setAuthError(
        /hamilton\.edu|Database error/i.test(desc)
          ? `Please sign in with your @${ALLOWED_EMAIL_DOMAIN} Google account.`
          : desc,
      )
      window.history.replaceState(null, '', window.location.pathname)
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="center muted">Loading…</div>
  if (!session) return <SignIn error={authError} />
  return <Planner />
}
