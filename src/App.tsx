import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ALLOWED_EMAIL_DOMAIN, initialAuthError, supabase } from './lib/supabase'
import SignIn from './components/SignIn'
import Planner from './components/Planner'
import { identifyStudent, resetAnalytics } from './lib/analytics'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    // Errors from the Google redirect (e.g. a non-Hamilton account rejected by the database).
    const desc = initialAuthError
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
      if (data.session) identifyStudent(data.session.user.id)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (s) identifyStudent(s.user.id)
      else if (event === 'SIGNED_OUT') resetAnalytics()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="center muted">Loading…</div>
  if (!session) return <SignIn error={authError} />
  return <Planner />
}
