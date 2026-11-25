// Sign-in server for scheduler.hamapps.dev (AWS Lambda behind CloudFront at /api/auth/*).
//
// Same method as HamEats (Auth.js): a full-page redirect to Google, and Google sends the student back
// to OUR domain (https://scheduler.hamapps.dev/api/auth/callback/google), so Google's screen says
// "to continue to scheduler.hamapps.dev". The server checks the account is a verified member of the
// Hamilton Google Workspace (the `hd` claim), then hands the verified Google sign-in to Supabase
// (grant_type=id_token), so the database's per-student rules keep working, and finally returns the
// student to the app with the Supabase session in the URL fragment (never sent to any server).
//
//   GET /api/auth/signin/google[?return=/path]   → redirect to Google
//   GET /api/auth/callback/google?code&state     → verify, sign in to Supabase, redirect to the app

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const LOGIN_DOMAIN = 'hamilton.edu'
const COOKIE = 'hs_oauth'
const COOKIE_MAX_AGE = 10 * 60 // seconds a sign-in may take

interface Env {
  SITE_URL: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  AUTH_COOKIE_SECRET: string
  SUPABASE_URL: string
  SUPABASE_PUBLISHABLE_KEY: string
}

/** Lambda function URL event (payload v2), as much of it as we use. */
export interface UrlEvent {
  rawPath: string
  queryStringParameters?: Record<string, string | undefined>
  cookies?: string[]
}
export interface UrlResult {
  statusCode: number
  headers?: Record<string, string>
  cookies?: string[]
  body?: string
}

const b64url = (buf: Buffer) => buf.toString('base64url')
const sha256 = (s: string) => createHash('sha256').update(s).digest()

// ---------- Signed, short-lived cookie holding this sign-in attempt ----------

interface Pending { state: string; verifier: string; nonce: string; ret: string; exp: number }

export function sealCookie(p: Pending, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(p)))
  const sig = b64url(createHmac('sha256', secret).update(body).digest())
  return `${body}.${sig}`
}

export function openCookie(value: string | undefined, secret: string, now = Date.now()): Pending | null {
  if (!value) return null
  const [body, sig] = value.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', secret).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as Pending
    return p.exp > now ? p : null
  } catch {
    return null
  }
}

const readCookie = (cookies: string[] | undefined, name: string) =>
  cookies?.map((c) => c.trim()).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1)

const cookieHeader = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`

/** Only same-site paths (no "//evil.com", no full URLs) may be returned to after sign-in. */
export const safeReturn = (r: string | undefined) => (r && /^\/(?!\/)[^\s\\]*$/.test(r) ? r : '/')

/** Decode a JWT's payload. The token comes straight from Google's token endpoint over HTTPS. */
export function jwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  if (!part) throw new Error('Malformed ID token')
  return JSON.parse(Buffer.from(part, 'base64url').toString())
}

/**
 * Whether Google's ID token is a verified account in the Hamilton Workspace (same rule as HamEats):
 * only the domain's own accounts carry hd=hamilton.edu, so a personal Google account that merely uses
 * a hamilton.edu address can't pass.
 */
export function isHamiltonAccount(c: Record<string, unknown>, clientId: string, hashedNonce: string): boolean {
  return (
    (c.iss === 'https://accounts.google.com' || c.iss === 'accounts.google.com') &&
    c.aud === clientId &&
    typeof c.exp === 'number' && c.exp * 1000 > Date.now() &&
    c.nonce === hashedNonce &&
    c.hd === LOGIN_DOMAIN &&
    c.email_verified === true &&
    typeof c.email === 'string' &&
    c.email.toLowerCase().endsWith(`@${LOGIN_DOMAIN}`)
  )
}

function redirect(location: string, cookies: string[] = []): UrlResult {
  return { statusCode: 302, headers: { Location: location, 'Cache-Control': 'no-store' }, cookies }
}

function backWithError(env: Env, message: string): UrlResult {
  const hash = new URLSearchParams({ error: 'access_denied', error_description: message })
  return redirect(`${env.SITE_URL}/#${hash}`, [cookieHeader('', 0)])
}

// ---------- Handlers ----------

export function startSignIn(env: Env, ret: string | undefined, now = Date.now()): UrlResult {
  const state = b64url(randomBytes(24))
  const verifier = b64url(randomBytes(48))   // PKCE
  const nonce = b64url(randomBytes(24))      // raw nonce: Google gets its SHA-256, Supabase the raw value
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${env.SITE_URL}/api/auth/callback/google`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce: sha256(nonce).toString('hex'),
    code_challenge: b64url(sha256(verifier)),
    code_challenge_method: 'S256',
    hd: LOGIN_DOMAIN, // Google offers Hamilton accounts first; the real check is isHamiltonAccount()
    prompt: 'select_account',
  })
  const cookie = sealCookie({ state, verifier, nonce, ret: safeReturn(ret), exp: now + COOKIE_MAX_AGE * 1000 }, env.AUTH_COOKIE_SECRET)
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, [cookieHeader(cookie, COOKIE_MAX_AGE)])
}

export async function finishSignIn(env: Env, event: UrlEvent): Promise<UrlResult> {
  const q = event.queryStringParameters ?? {}
  if (q.error) return backWithError(env, q.error === 'access_denied' ? 'Sign-in was cancelled.' : `Google: ${q.error}`)
  const pending = openCookie(readCookie(event.cookies, COOKIE), env.AUTH_COOKIE_SECRET)
  if (!pending || !q.state || q.state !== pending.state || !q.code) {
    return backWithError(env, 'Your sign-in expired or was interrupted. Please try again.')
  }

  // 1. Exchange Google's one-time code for the ID token.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code: q.code,
      code_verifier: pending.verifier,
      grant_type: 'authorization_code',
      redirect_uri: `${env.SITE_URL}/api/auth/callback/google`,
    }),
  })
  const tokens = (await tokenRes.json()) as { id_token?: string; error?: string }
  if (!tokenRes.ok || !tokens.id_token) return backWithError(env, 'Google sign-in failed. Please try again.')

  // 2. Only verified Hamilton Workspace accounts.
  const claims = jwtPayload(tokens.id_token)
  if (!isHamiltonAccount(claims, env.GOOGLE_CLIENT_ID, sha256(pending.nonce).toString('hex'))) {
    return backWithError(env, `Please sign in with your @${LOGIN_DOMAIN} Google account.`)
  }

  // 3. Hand the verified Google sign-in to Supabase (it re-verifies the token's signature).
  const sbRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'google', id_token: tokens.id_token, nonce: pending.nonce }),
  })
  const session = (await sbRes.json()) as Record<string, unknown>
  if (!sbRes.ok || typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
    console.error('Supabase sign-in failed', sbRes.status, session.msg ?? session.error_description ?? session.error)
    return backWithError(env, `Please sign in with your @${LOGIN_DOMAIN} Google account.`)
  }

  // 4. Back to the app; supabase-js picks the session up from the fragment and clears it.
  const hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: String(session.expires_in ?? 3600),
    expires_at: String(session.expires_at ?? Math.floor(Date.now() / 1000) + 3600),
    token_type: 'bearer',
  })
  return redirect(`${env.SITE_URL}${pending.ret}#${hash}`, [cookieHeader('', 0)])
}

export async function handler(event: UrlEvent): Promise<UrlResult> {
  const env = process.env as unknown as Env
  try {
    if (event.rawPath === '/api/auth/signin/google') return startSignIn(env, event.queryStringParameters?.return)
    if (event.rawPath === '/api/auth/callback/google') return await finishSignIn(env, event)
    return { statusCode: 404, headers: { 'Content-Type': 'text/plain' }, body: 'Not found' }
  } catch (e) {
    console.error(e)
    return backWithError(env, 'Something went wrong signing in. Please try again.')
  }
}
