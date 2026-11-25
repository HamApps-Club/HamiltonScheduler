import { useState } from 'react'
import { ALLOWED_EMAIL_DOMAIN, isLocalSupabase, supabase } from '../lib/supabase'

export default function SignIn({ error }: { error: string | null }) {
  const [message, setMessage] = useState<string | null>(error)

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Suggests Hamilton accounts in Google's picker; the database is what actually enforces it.
        queryParams: { hd: ALLOWED_EMAIL_DOMAIN, prompt: 'select_account' },
      },
    })
    if (error) setMessage(error.message)
  }

  // Local development only: the test student from supabase/seed.sql.
  async function signInAsLocalTestStudent() {
    const { error } = await supabase.auth.signInWithPassword({ email: 'dev@hamilton.edu', password: 'local-dev-only' })
    if (error) setMessage(error.message)
  }

  return (
    <main className="signin">
      <h1>Hamilton Scheduler</h1>
      <p className="muted">Plan your semester. Sign in with your Hamilton Google account.</p>
      <button className="primary" onClick={signInWithGoogle}>Sign in with Google</button>
      {message && <p className="error" role="alert">{message}</p>}
      {import.meta.env.DEV && isLocalSupabase && (
        <button className="link" onClick={signInAsLocalTestStudent}>
          Local test sign-in (dev@hamilton.edu)
        </button>
      )}
      <p className="muted small">A HamApps project.</p>
    </main>
  )
}
