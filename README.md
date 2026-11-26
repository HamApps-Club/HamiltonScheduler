# Hamilton Scheduler

A HamApps project: plan your Hamilton College semester. Search the course catalog,
build up to three schedules per semester on a weekly calendar, and export to Google Calendar.

- **Front end:** React + Vite (TypeScript)
- **Database:** Supabase (Postgres, Row Level Security)
- **Sign-in:** Google, Hamilton accounts only, through our own `/api/auth` server (`infra/auth.ts`), which then signs the student in to Supabase
- **Hosting:** AWS via SST (profile `hamapps`, region `us-east-2`) at https://scheduler.hamapps.dev; deploys automatically on every push to `main`

## Run it locally

Needs Docker Desktop running.

```bash
npm install
supabase start          # local database + login service, loads the sample data (real Fall 2026 + Spring 2027 catalogs, test student)
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
supabase/seed.sql      LOCAL-ONLY semesters and test student
supabase/seeds/        LOCAL-ONLY course catalogs (copied from the live site) + test schedules
src/                   the React app
infra/auth.ts          Google sign-in server (Lambda at /api/auth)
infra/keepalive.ts     daily Supabase check; emails an alert if it's down
infra/github-deploy-role.yaml   AWS role GitHub Actions uses to deploy (no AWS keys in GitHub)
.github/workflows/     deploy on push to main
sst.config.ts          AWS hosting (CloudFront Router, S3 site, Lambdas, alerts)
```

Course data tools (`scripts/`) and data files (`data/`) are git-ignored and stay on the
maintainer's computer; see `scripts/README.md` there.

## Adding a search filter

No database access needed: the local seed has the full real catalogs, and filters run in the
browser on the semester's loaded courses.

The chips under the search box (Writing Intensive, Quantitative, First Year, …) come from
`TYPE_FILTERS` in `src/lib/filters.ts`. **To add a course-type filter, add one line there**; the chip,
the filtering and the empty-search browsing all follow from it:

```ts
{ id: 'qlit', label: 'Quant Literacy', types: ['Qlit Course'] },
```

A filter matches a section that has any of its `types` labels; with several chips on, a section must
match all of them. With any chip on, an empty search lists every matching course. Add a test case in
`src/lib/filters.test.ts`.

Each section has `types`: the course types from Self-Service. Labels are Self-Service's own:

| Label in `types` | Meaning |
|---|---|
| `Writing Intensive Courses` | Writing-intensive. Use this label, not the code: most W codes match, but not all (e.g. SOC 276W in Spring 2027 is untagged) |
| `Speaking Intensive Course` | Speaking-intensive |
| `Quantitative & Symbolic R` | Quantitative & symbolic reasoning |
| `Qlit Course` | Quantitative literacy |
| `First Year Courses` | Reserved for first-years (can be one section of a course) |
| `Proseminar` | Proseminar |
| `Cultural Diversity Course`, `Diversity Course` | Diversity requirements |
| `Soc, Struct & Inst Hier` | Social structures & institutional hierarchies |
| `Senior Project`, `Co-Lab Course`, `Experiential Learning`, `Physical Education Course`, … | Others; list them all with `select distinct unnest(types) from sections;` |

Types are per **section** (e.g. only one MATH 113 section is first-years only), so filters keep the
sections that match, the same way "Hide closed" does (`src/components/Sidebar.tsx`, the `results` list).
Other kinds of filter (time of day, credits, …) go in that same list.

Keep Self-Service's labels in the database and put friendly names in `label`, so the next catalog
import keeps matching.

## Secrets

Never commit `.env`. Copy `.env.example` to `.env` and fill in:

| Variable | Where to find it | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | No |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys → Publishable key | No (public by design) |
| `SUPABASE_URL` | Same as the Project URL | No |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → Secret key | **Yes**: local data tools only, never in a `VITE_` variable |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Zone DNS edit for hamapps.dev) | **Yes** |
| `CLOUDFLARE_DEFAULT_ACCOUNT_ID` | Cloudflare dashboard → hamapps.dev → Account ID | No |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials | No |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Same OAuth client | **Yes** |
| `AUTH_COOKIE_SECRET` | Any long random string (`openssl rand -base64 32`) | **Yes** |

## How it's deployed

Every push to `main` runs `.github/workflows/deploy.yml`: unit tests, then
`npx sst deploy --stage production`. GitHub signs in to AWS with the role from
`infra/github-deploy-role.yaml` (stack `hamilton-scheduler-github`, us-east-2), so no AWS keys
are stored in GitHub. The workflow needs the repository variable `AWS_DEPLOY_ROLE_ARN` and the
`.env` values above (except the `SUPABASE_*` data-tool ones) as repository secrets
(Settings → Secrets and variables → Actions).

To deploy by hand instead: `eval "$(aws configure export-credentials --profile hamapps --format env)"`,
then `npx sst deploy --stage production`.

### Online setup (already done; for reference if it ever needs redoing)

1. **Google OAuth client** (Web application), authorized redirect URI
   `https://scheduler.hamapps.dev/api/auth/callback/google`.
2. **Supabase → Authentication → Providers:** Google enabled with the same client ID (Supabase
   checks the ID token the `/api/auth` server hands it); Email and other providers disabled.
   The database also rejects non-Google sign-ups.
3. **Supabase → Authentication → URL Configuration:** Site URL `https://scheduler.hamapps.dev`.
4. **Database schema:** `supabase link --project-ref evczdyzsqzwuxudjvhsc`, then `supabase db push`
   whenever a new migration is added.
5. **Course data:** loaded with the local data tools (`scripts/`, not in this repo).
6. **Alerts:** confirm the one-time SNS subscription email sent to `hamappsdevs@gmail.com`.
