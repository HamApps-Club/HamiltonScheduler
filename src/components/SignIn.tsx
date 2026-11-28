import { useState } from 'react'
import { ALLOWED_EMAIL_DOMAIN, isLocalSupabase, supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

// Sign-in works like HamEats: a full-page redirect to Google, which sends the student back to our own
// server at /api/auth/callback/google (infra/auth.ts). Google's screen therefore says
// "to continue to scheduler.hamapps.dev". That server checks the account is in the Hamilton Google
// Workspace, signs the student in to Supabase, and returns here with the session.
//
// Look: Cici (the HamApps box-cat, drawn per HamApps/cici-art-guide.txt) greets the student next to a
// card drawn as the Scheduler's calendar logo. Always light: Cici's navy lines vanish on dark backgrounds.

// The terms table is readable only after sign-in, so guess the term students are planning from the date:
// Spring registration runs in the fall (Oct-Dec plans next year's Spring), Fall registration in the spring.
function planningTerm(now = new Date()): string {
  const m = now.getMonth() // 0 = Jan
  const y = now.getFullYear()
  if (m >= 9) return `Spring ${y + 1}`
  if (m <= 2) return `Spring ${y}`
  return `Fall ${y}`
}

// A few sample classes for the mini week (row = hour, col = Mon..Fri).
const WEEK: { hour: string; cells: ([string, string] | null)[] }[] = [
  { hour: '9', cells: [['CPSCI 110', 'n'], null, ['CPSCI 110', 'n'], null, ['CPSCI 110', 'n']] },
  { hour: '10', cells: [null, ['ECON 100', 'g'], null, ['ECON 100', 'g'], null] },
  { hour: '11', cells: [['WRTG 101', 'p'], null, ['WRTG 101', 'p'], null, null] },
  { hour: '1', cells: [null, ['BIO 100 Lab', 'm'], null, null, null] },
]

export default function SignIn({ error }: { error: string | null }) {
  const [message, setMessage] = useState<string | null>(error)
  const [leaving, setLeaving] = useState(false)

  function signInWithGoogle() {
    track('sign_in_clicked', undefined, true)
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
    <div className="si-page">
      <header className="si-top">
        <img src="/favicon.svg" alt="" />
        Hamilton Scheduler
      </header>

      <main className="si-main">
        <section className="si-hello">
          <div className="si-bubble">
            <h2>Hi, I'm Cici!</h2>
            <p>Let's plan your semester. I'll keep your classes from bumping into each other.</p>
          </div>
          <CiciHappy />
        </section>

        <section className="si-cal" aria-labelledby="si-title">
          <span className="si-ring l" />
          <span className="si-ring r" />
          <div className="si-cal-head">
            <h1 id="si-title">Hamilton Scheduler</h1>
            <span className="si-term">{planningTerm()} is live</span>
          </div>
          <div className="si-cal-body">
            <div className="si-week" aria-hidden="true">
              <span />
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
                <span key={d} className="si-d">{d}</span>
              ))}
              {WEEK.map((row) => [
                <span key={row.hour} className="si-t">{row.hour}</span>,
                ...row.cells.map((c, i) =>
                  c ? (
                    <span key={row.hour + i} className={`si-c ${c[1]}`}>{c[0]}</span>
                  ) : (
                    <span key={row.hour + i} className="si-cell" />
                  ),
                ),
              ])}
            </div>

            <button className="si-google" onClick={signInWithGoogle} disabled={leaving || isLocalSupabase}>
              <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
                <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.9-6.1z" />
                <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
              </svg>
              {leaving ? 'Opening Google…' : 'Sign in with Google'}
            </button>
            {message && <p className="si-error" role="alert">{message}</p>}
            <p className="si-fine">
              Use your <b>@{ALLOWED_EMAIL_DOMAIN}</b> account.
            </p>
            {import.meta.env.DEV && isLocalSupabase && (
              <p className="si-fine">
                Google sign-in runs on the live site only.{' '}
                <button className="link" onClick={signInAsLocalTestStudent}>Local test sign-in (dev@hamilton.edu)</button>
              </p>
            )}
          </div>
        </section>
      </main>

      <footer className="si-foot">
        A <a href="https://hamapps.dev">HamApps</a> project · made by Hamilton students
      </footer>
    </div>
  )
}

// Cici in the logo pose with happy "^ ^" eyes and blush, mirrored to face right (toward the card).
function CiciHappy() {
  const ln = { fill: 'none', stroke: '#0f366f', strokeWidth: 38, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg className="si-cici" viewBox="-60 -40 1120 940" role="img" aria-label="Cici the box-cat, smiling">
      <g transform="translate(997 0) scale(-1 1)">
        <g transform="rotate(-6 500 420)">
          <path fill="#f8f4ee" d="M285 32 L432 102 L675 15 L972 165 L972 580 L605 715 L333 557 L334 178 Z" />
          <path fill="#e3c06f" d="M432 102 L675 15 L972 165 L818 226 Z" />
          <path {...ln} d="M334 178 L285 32 Q392 28 432 102" />
          <path {...ln} d="M334 178 L331 552 L125 625" />
          <path {...ln} d="M432 102 L675 15 L972 165 L972 580 L385 822" />
          <path {...ln} d="M334 552 L608 700" />
          <path {...ln} d="M820 248 L958 200" />
          <path {...ln} d="M125 625 C125 560 105 500 70 497 C35 495 22 545 25 575 C28 605 40 630 58 645" />
          <path {...ln} d="M385 822 C385 760 365 702 330 700 C290 700 275 745 278 770 C282 800 300 820 318 832" />
          <path {...ln} d="M578 263 C650 195 740 150 808 138" />
          <path fill="#0f366f" d="M786 140 L827 136 L816 232 L838 268 L840 365 L778 383 L773 285 Z" />
          <path fill="#0f366f" d="M786 507 L838 492 L845 610 L800 628 L790 620 Z" />
          <path {...ln} d="M388 438 Q412 392 438 442" />
          <path {...ln} d="M515 498 Q566 410 620 502" />
          <ellipse cx="402" cy="495" rx="30" ry="16" fill="#f29bb0" transform="rotate(14 402 495)" />
          <ellipse cx="600" cy="565" rx="38" ry="19" fill="#f29bb0" transform="rotate(14 600 565)" />
        </g>
      </g>
    </svg>
  )
}
