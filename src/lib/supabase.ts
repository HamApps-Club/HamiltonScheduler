import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill them in.')
}

// The publishable key is public by design: Row Level Security in the database
// decides what each signed-in student can see and change.
export const supabase = createClient(url, key)

/** True when the app is talking to the local Supabase on this computer. */
export const isLocalSupabase = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)

export const ALLOWED_EMAIL_DOMAIN = 'hamilton.edu'
