import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { isValidGoogleSignIn, jwtPayload, openCookie, safeReturn, sealCookie, startSignIn } from './auth.ts'

const env = {
  SITE_URL: 'https://scheduler.hamapps.dev',
  GOOGLE_CLIENT_ID: 'client-123.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'x',
  AUTH_COOKIE_SECRET: 'test-secret-test-secret-test-secret',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
}
const hex = (s: string) => createHash('sha256').update(s).digest('hex')

describe('sign-in cookie', () => {
  const p = { state: 's', verifier: 'v', nonce: 'n', ret: '/', exp: Date.now() + 60_000 }
  it('round-trips when untouched', () => {
    expect(openCookie(sealCookie(p, env.AUTH_COOKIE_SECRET), env.AUTH_COOKIE_SECRET)).toMatchObject({ state: 's' })
  })
  it('rejects tampering, the wrong secret, and expiry', () => {
    const c = sealCookie(p, env.AUTH_COOKIE_SECRET)
    const [body, sig] = c.split('.')
    const forged = Buffer.from(JSON.stringify({ ...p, ret: '/evil' })).toString('base64url')
    expect(openCookie(`${forged}.${sig}`, env.AUTH_COOKIE_SECRET)).toBeNull()
    expect(openCookie(`${body}.${sig}`, 'other-secret')).toBeNull()
    expect(openCookie(sealCookie({ ...p, exp: Date.now() - 1 }, env.AUTH_COOKIE_SECRET), env.AUTH_COOKIE_SECRET)).toBeNull()
  })
})

describe('safeReturn', () => {
  it('allows only same-site paths', () => {
    expect(safeReturn('/')).toBe('/')
    expect(safeReturn('/plan?x=1')).toBe('/plan?x=1')
    expect(safeReturn('//evil.com')).toBe('/')
    expect(safeReturn('https://evil.com')).toBe('/')
    expect(safeReturn(undefined)).toBe('/')
  })
})

describe('startSignIn', () => {
  it('redirects to Google with our callback, PKCE, a hashed nonce and hd=hamilton.edu', () => {
    const r = startSignIn(env, '/')
    const url = new URL(r.headers!.Location)
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('redirect_uri')).toBe('https://scheduler.hamapps.dev/api/auth/callback/google')
    expect(url.searchParams.get('hd')).toBe('hamilton.edu')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('nonce')).toMatch(/^[0-9a-f]{64}$/)
    const cookie = r.cookies![0]
    expect(cookie).toMatch(/^hs_oauth=.+; Path=\/api\/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/)
    const pending = openCookie(cookie.split(';')[0].slice('hs_oauth='.length), env.AUTH_COOKIE_SECRET)!
    expect(url.searchParams.get('state')).toBe(pending.state)
    expect(url.searchParams.get('nonce')).toBe(hex(pending.nonce))
  })
})

describe('isValidGoogleSignIn (who may sign in is decided by the database)', () => {
  const ok = {
    iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 600,
    nonce: hex('n'), hd: 'hamilton.edu', email_verified: true, email: 'BNTaylor@hamilton.edu',
  }
  it('accepts a verified Hamilton Workspace account', () => {
    expect(isValidGoogleSignIn(ok, env.GOOGLE_CLIENT_ID, hex('n'))).toBe(true)
  })
  it('passes a verified non-Hamilton account on to the database (its guest list decides)', () => {
    expect(isValidGoogleSignIn({ ...ok, hd: 'example.edu', email: 'guest@example.edu' }, env.GOOGLE_CLIENT_ID, hex('n'))).toBe(true)
    expect(isValidGoogleSignIn({ ...ok, hd: undefined, email: 'guest@gmail.com' }, env.GOOGLE_CLIENT_ID, hex('n'))).toBe(true)
  })
  it.each([
    ['unverified email', { email_verified: false }],
    ['missing email', { email: undefined }],
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['wrong audience', { aud: 'someone-else' }],
    ['wrong nonce', { nonce: hex('other') }],
    ['expired', { exp: 1 }],
  ])('rejects %s', (_label, change) => {
    expect(isValidGoogleSignIn({ ...ok, ...change }, env.GOOGLE_CLIENT_ID, hex('n'))).toBe(false)
  })
  it('decodes a JWT payload', () => {
    const tok = ['e30', Buffer.from(JSON.stringify({ hd: 'hamilton.edu' })).toString('base64url'), 'sig'].join('.')
    expect(jwtPayload(tok)).toEqual({ hd: 'hamilton.edu' })
  })
})
