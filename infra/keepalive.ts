// Daily Supabase check (AWS Lambda, run by an EventBridge schedule from sst.config.ts).
//
// 1. Calls the database's public health() function and the sign-in service's health endpoint.
//    Using the database once a day also keeps the free Supabase project from pausing.
// 2. If either check fails, emails an alert through the SNS topic (to the club address).
//
// Uses only the PUBLIC (publishable) key — no secrets.

import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'

const sns = new SNSClient({})

async function check(name: string, url: string, init: RequestInit, expect: (res: Response, body: string) => boolean): Promise<string | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
    const body = await res.text()
    return expect(res, body) ? null : `${name}: HTTP ${res.status} ${body.slice(0, 200)}`
  } catch (e) {
    return `${name}: ${e instanceof Error ? e.message : String(e)}`
  }
}

export async function handler(): Promise<{ ok: boolean; problems: string[] }> {
  const base = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!
  const headers = { apikey: key, 'Content-Type': 'application/json' }

  const problems = (await Promise.all([
    check('Database', `${base}/rest/v1/rpc/health`, { method: 'POST', headers, body: '{}' },
      (res, body) => res.ok && body.includes('ok')),
    check('Sign-in service', `${base}/auth/v1/health`, { headers },
      (res) => res.ok),
  ])).filter((p): p is string => p !== null)

  if (problems.length) {
    console.error('Supabase check failed:', problems)
    await sns.send(new PublishCommand({
      TopicArn: process.env.ALERT_TOPIC_ARN,
      Subject: 'Hamilton Scheduler: Supabase is not responding',
      Message: [
        'The daily check of the Hamilton Scheduler database failed:',
        '',
        ...problems.map((p) => `- ${p}`),
        '',
        'If the project was paused for inactivity, restore it in the Supabase dashboard',
        '(supabase.com/dashboard → the "coursescheduler" project → Restore).',
        `Checked at ${new Date().toISOString()}.`,
      ].join('\n'),
    }))
  } else {
    console.log('Supabase check OK')
  }
  return { ok: problems.length === 0, problems }
}
