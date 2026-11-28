import type { PostHog } from 'posthog-js'

// PostHog analytics, shared "HamApps" project (also used by hamapps.dev and HamEats).
// The phc_ key is PostHog's public, send-only project key: it is meant to ship in the browser.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || 'phc_pRMhKfUTLbr9LWvxuor7h3JnqWKVCUYaxycy5TQL9HPs'
// Only the live site sends data, so local `npm run dev` and preview stages never pollute the numbers.
const LIVE_HOSTS = ['scheduler.hamapps.dev']

let enabled = false
let ph: PostHog | null = null
// Calls made before PostHog finishes loading; replayed in order once it's ready.
const queue: ((p: PostHog) => void)[] = []

function withPostHog(fn: (p: PostHog) => void) {
  if (!enabled) return
  if (ph) fn(ph)
  else queue.push(fn)
}

/**
 * Start PostHog once. Does nothing outside the live site.
 * PostHog is loaded as a separate file after the app, so it never slows down the first screen.
 */
export function initAnalytics() {
  if (enabled || !LIVE_HOSTS.includes(window.location.hostname)) return
  enabled = true
  import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: 'https://us.i.posthog.com',
        ui_host: 'https://us.posthog.com',
        defaults: '2025-05-24', // pageviews on history changes, page leave events
        person_profiles: 'identified_only',
        disable_session_recording: true, // no screen recordings, analytics events only
      })
      posthog.register({ app: 'scheduler' }) // lets one dashboard split numbers by app
      ph = posthog
      for (const fn of queue.splice(0)) fn(posthog)
    })
    .catch(() => { enabled = false; queue.length = 0 }) // blocked by an ad-blocker: carry on without analytics
}

/**
 * Tie events to the signed-in student by their random Supabase user ID only.
 * Never send the email or name: PostHog should not hold student identities.
 */
export function identifyStudent(userId: string) {
  withPostHog((p) => { if (p.get_distinct_id() !== userId) p.identify(userId) })
}

/** Forget the student on this browser (after logout). */
export function resetAnalytics() {
  withPostHog((p) => p.reset())
}

/**
 * Send an event if analytics is on; otherwise do nothing.
 * `leaving: true` sends it immediately, for clicks that navigate away from the page.
 */
export function track(event: string, properties?: Record<string, unknown>, leaving = false) {
  withPostHog((p) => p.capture(event, properties, leaving ? { send_instantly: true } : undefined))
}
