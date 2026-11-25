# Hamilton Scheduler

A HamApps project: plan your Hamilton College semester. Search the course catalog,
build up to three schedules per semester on a weekly calendar, and export to Google Calendar.

- **Front end:** React + Vite (TypeScript)
- **Database + login:** Supabase (Postgres, Row Level Security, Google sign-in for `@hamilton.edu` only)
- **Hosting:** AWS S3 + CloudFront via SST (profile `hamapps`, region `us-east-2`)

## Run it locally

Needs Docker Desktop running.

```bash
npm install
supabase start          # local database + login service, loads supabase/seed.sql sample data
npm run dev             # http://127.0.0.1:5173
```

`.env.development.local` (git-ignored) points the dev server at the local database. On the
sign-in page, use **Local test sign-in** (`dev@hamilton.edu`). That button only appears in
development against the local database.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (time conflicts, calendar export) |
| `npm run db:test` | Database tests: sign-up rules, RLS, schedule limits (30 checks) |
| `npm run typecheck` | TypeScript check |
| `supabase db reset` | Wipe the local database and rebuild it from migrations + seed |
| `supabase stop` | Stop the local containers |

## Project layout

```
supabase/migrations/   database tables, rules, and security policies
supabase/tests/        database tests (pgTAP)
supabase/seed.sql      LOCAL-ONLY sample data and test user
src/                   the React app
sst.config.ts          AWS hosting (S3 + CloudFront)
```

## Secrets

Never commit `.env`. Copy `.env.example` to `.env` and fill in:

| Variable | Where to find it | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | No |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key | No (public by design) |
| `SUPABASE_URL` | Same as the Project URL | No |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key | **Yes**: local data tools only, never in a `VITE_` variable |

## Going live checklist

Each step creates or changes something online, so do them deliberately:

1. **Google OAuth client** (Google Cloud Console → APIs & Services → Credentials): Web application,
   authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase dashboard → Authentication → Providers:** enable Google with that client ID/secret;
   **disable Email** (and any other provider). The database also rejects non-Google sign-ups.
3. **Supabase → Authentication → URL Configuration:** set Site URL to the live site
   (the CloudFront URL now, `https://scheduler.hamapps.dev` later) and add it to Redirect URLs.
4. **Push the database:** `supabase link --project-ref evczdyzsqzwuxudjvhsc` then `supabase db push`.
5. **Load course data** (local data tools; not in this repo).
6. **Deploy the site:** `npx sst deploy --stage production`.
7. **Custom domain (after Dec 3):** uncomment `domain` in `sst.config.ts`, add a Cloudflare API token, redeploy.
