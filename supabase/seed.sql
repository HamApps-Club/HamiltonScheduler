-- LOCAL DEVELOPMENT ONLY. Loaded by `supabase start` / `supabase db reset`.
-- Never pushed to the online project (`supabase db push` does not run seed files).
-- Load order (supabase/config.jsonc): this file (terms, test student), then the real
-- course catalogs copied from the online project by scripts/make-seed.ts
-- (seeds/2026FA-catalog.sql, seeds/2027SP-catalog.sql), then seeds/dev-schedule.sql
-- (classes on the test student's schedules).
-- Term dates and no-class days match the online project (from the academic calendar).

insert into public.terms (id, name, is_active, start_date, end_date, no_class_dates) values
  ('2026SP', 'Spring 2026', false, '2026-01-21', '2026-05-08', '{}'),
  ('2026FA', 'Fall 2026',   true,  '2026-08-27', '2026-12-11', '{2026-10-15,2026-10-16,2026-11-23,2026-11-24,2026-11-25,2026-11-26,2026-11-27}'),
  ('2027SP', 'Spring 2027', true,  '2027-01-20', '2027-05-11', '{2027-03-15,2027-03-16,2027-03-17,2027-03-18,2027-03-19,2027-03-22,2027-03-23,2027-03-24,2027-03-25,2027-03-26}');

-- Local test student (password sign-in works ONLY on the local stack; the online
-- project has email/password sign-in turned off). Marked as a Google account so the
-- sign-up rules accept it; the first-login trigger creates its profile and schedule.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'dev@hamilton.edu',
  extensions.crypt('local-dev-only', extensions.gen_salt('bf')), now(),
  '{"provider":"google","providers":["google"]}', '{}', now(), now(),
  '', '', '', ''
);
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
values (
  gen_random_uuid(), 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'email',
  '{"sub":"d0000000-0000-4000-8000-000000000001","email":"dev@hamilton.edu","email_verified":true}',
  now(), now(), now()
);
