import { useState } from 'react'
import { isLocalSupabase, supabase } from '../lib/supabase'

// Sign-in works like HamEats: a full-page redirect to Google, which sends the student back to our own
// server at /api/auth/callback/google (infra/auth.ts). Google's screen therefore says
// "to continue to scheduler.hamapps.dev". That server checks the account is in the Hamilton Google
// Workspace, signs the student in to Supabase, and returns here with the session.

export default function SignIn({ error }: { error: string | null }) {
  const [message, setMessage] = useState<string | null>(error)
  const [leaving, setLeaving] = useState(false)

  function signInWithGoogle() {
    setLeaving(true)
    const ret = window.location.pathname + window.location.search
    window.location.assign(`/api/auth/signin/google?return=${encodeURIComponent(ret)}`)
  }

  // Local development only: the test student from supabase/seed.sql (the /api/auth server runs on AWS only).
  async function signInAsLocalTestStudent() {
    const { error } = await supabase.auth.signInWithPassword({ email: 'dev@hamilton.edu', password: 'local-dev-only' })
    if (error) setMessage(error.message)
  }

  return (
    <main className="signin">
      <h1>Hamilton Scheduler</h1>
      <p className="muted">Plan your semester. Sign in with your Hamilton Google account.</p>
      <button className="primary google-btn" onClick={signInWithGoogle} disabled={leaving || isLocalSupabase}>
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
          <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
        {leaving ? 'Opening Google…' : 'Sign in with Google'}
      </button>
      {message && <p className="error" role="alert">{message}</p>}
      {import.meta.env.DEV && isLocalSupabase && (
        <>
          <p className="muted small">Google sign-in runs on the live site only.</p>
          <button className="link" onClick={signInAsLocalTestStudent}>Local test sign-in (dev@hamilton.edu)</button>
        </>
      )}
      <p className="muted small">A HamApps project.</p>
    </main>
  )
}
