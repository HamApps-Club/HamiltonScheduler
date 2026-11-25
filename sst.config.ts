/// <reference path="./.sst/platform/config.d.ts" />

// Hosting for the Hamilton Scheduler:
// - Router: CloudFront for scheduler.hamapps.dev; /api/auth/* → Auth Lambda, everything else → Web.
// - Web: the built React app in a private S3 bucket.
// - Auth: the Google sign-in server (same method as HamEats), see infra/auth.ts.
// - SupabaseCheck: one small Lambda, run daily, that checks Supabase (which also keeps the
//   free project from pausing) and emails ALERT_EMAIL through SNS if it's down.
//
//   npx sst deploy --stage production   # creates/updates the AWS resources (needs your OK)
//   npx sst remove --stage <stage>      # deletes a non-production stage
//
// The site reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from .env at build time.

const ALERT_EMAIL = 'hamappsdevs@gmail.com' // gets a one-time "confirm subscription" email after the first deploy

export default $config({
  app(input) {
    return {
      name: 'hamilton-scheduler',
      home: 'aws',
      // Keep production resources if the stack is ever removed by mistake.
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      protect: input?.stage === 'production',
      providers: {
        // Uses the `hamapps` profile, unless temporary credentials were passed in the environment
        // (needed with `aws login`: run `eval "$(aws configure export-credentials --profile hamapps --format env)"` first).
        aws: { region: 'us-east-2', ...(process.env.AWS_ACCESS_KEY_ID ? {} : { profile: 'hamapps' }) },
        // DNS for scheduler.hamapps.dev. Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_DEFAULT_ACCOUNT_ID from .env.
        cloudflare: '6.15.0',
      },
    }
  },
  async run() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!supabaseUrl || !publishableKey) {
      throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env before deploying.')
    }
    if (/sb_secret_|service_role/.test(publishableKey)) {
      throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY looks like a SECRET key. Use the publishable key; never ship the secret key to the browser.')
    }
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_DEFAULT_ACCOUNT_ID) {
      throw new Error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_DEFAULT_ACCOUNT_ID in .env (needed for scheduler.hamapps.dev).')
    }
    if (/127\.0\.0\.1|localhost/.test(supabaseUrl)) {
      throw new Error('VITE_SUPABASE_URL points at the local database. Use your online project URL for deploys.')
    }

    const SITE_URL = 'https://scheduler.hamapps.dev'
    for (const k of ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'AUTH_COOKIE_SECRET']) {
      if (!process.env[k]) throw new Error(`Set ${k} in .env (needed by the /api/auth sign-in server).`)
    }

    // One CloudFront entry point for scheduler.hamapps.dev: /api/auth/* goes to the sign-in Lambda,
    // everything else to the static site. SKIP_DOMAIN=1 deploys without the domain (only needed once,
    // to move the domain off the old distribution).
    const router = new sst.aws.Router('Router', {
      domain: process.env.SKIP_DOMAIN ? undefined : { name: 'scheduler.hamapps.dev', dns: sst.cloudflare.dns() },
    })

    new sst.aws.StaticSite('Web', {
      build: { command: 'npm run build', output: 'dist' },
      environment: {
        VITE_SUPABASE_URL: supabaseUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      },
      router: { instance: router },
    })

    // Sign-in server (same method as HamEats): Google redirects back to SITE_URL/api/auth/callback/google.
    new sst.aws.Function('Auth', {
      handler: 'infra/auth.handler',
      runtime: 'nodejs22.x',
      timeout: '15 seconds',
      memory: '256 MB',
      url: { router: { instance: router, path: '/api/auth' } },
      environment: {
        SITE_URL,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        AUTH_COOKIE_SECRET: process.env.AUTH_COOKIE_SECRET!,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_PUBLISHABLE_KEY: publishableKey,
      },
    })

    // Daily Supabase check + email alert.
    const alerts = new sst.aws.SnsTopic('Alerts')
    new aws.sns.TopicSubscription('AlertsEmail', {
      topic: alerts.arn,
      protocol: 'email',
      endpoint: ALERT_EMAIL,
    })
    new sst.aws.CronV2('SupabaseCheck', {
      schedule: 'rate(1 day)',
      function: {
        handler: 'infra/keepalive.handler',
        runtime: 'nodejs22.x',
        timeout: '30 seconds',
        memory: '128 MB',
        link: [alerts], // allows publishing to the topic
        environment: {
          SUPABASE_URL: supabaseUrl,
          SUPABASE_PUBLISHABLE_KEY: publishableKey,
          ALERT_TOPIC_ARN: alerts.arn,
        },
      },
    })

    return { url: router.url }
  },
})
