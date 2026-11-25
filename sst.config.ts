/// <reference path="./.sst/platform/config.d.ts" />

// Hosting for the Hamilton Scheduler:
// - Web: the built React app in a private S3 bucket, served through CloudFront.
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
        aws: { profile: 'hamapps', region: 'us-east-2' },
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
    if (/127\.0\.0\.1|localhost/.test(supabaseUrl)) {
      throw new Error('VITE_SUPABASE_URL points at the local database. Use your online project URL for deploys.')
    }

    const site = new sst.aws.StaticSite('Web', {
      build: { command: 'npm run build', output: 'dist' },
      environment: {
        VITE_SUPABASE_URL: supabaseUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      },
      // After the domain moves (after Dec 3), uncomment and set up a Cloudflare API token:
      // domain: { name: 'scheduler.hamapps.dev', dns: sst.cloudflare.dns() },
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

    return { url: site.url }
  },
})
