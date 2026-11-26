-- LOCAL DEVELOPMENT ONLY. Loaded by `supabase start` / `supabase db reset`.
-- Never pushed to the online project (`supabase db push` does not run seed files).
-- Load order (supabase/config.jsonc): this file (terms, test student), then
-- seeds/2026FA-catalog.sql (the real Fall 2026 catalog, copied from the online project by
-- scripts/make-seed.ts), then seeds/dev-schedule.sql (Fall classes on the test student's schedule).
-- Fall 2026 matches the online project; Spring 2027 is still a one-course placeholder.

insert into public.terms (id, name, is_active, start_date, end_date, no_class_dates) values
  ('2026SP', 'Spring 2026', false, '2026-01-21', '2026-05-08', '{}'),
  ('2026FA', 'Fall 2026',   true,  '2026-08-27', '2026-12-11', '{2026-10-15,2026-10-16,2026-11-23,2026-11-24,2026-11-25,2026-11-26,2026-11-27}'),
  ('2027SP', 'Spring 2027', true,  '2027-01-20', '2027-05-07', '{2027-03-15,2027-03-16,2027-03-17,2027-03-18,2027-03-19}');

-- The one sample course shown for now. Unknown details (instructor, room, credits) are left blank.
insert into public.courses (term_id, code, title, department) values
  ('2027SP', 'AFRST 159', 'Elementary Jazz Dance', 'Africana Studies');

insert into public.sections (course_id, section, days, start_time, end_time, status)
select id, '01', 'MW', '08:30', '09:45', 'open' from public.courses where term_id = '2027SP' and code = 'AFRST 159';

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

-- Put AFRST 159-01 on the test student's "My Schedule" (created by the first-login trigger).
insert into public.schedule_sections (schedule_id, section_id)
select sch.id, sec.id
from public.schedules sch
join public.courses c on c.term_id = sch.term_id and c.code = 'AFRST 159'
join public.sections sec on sec.course_id = c.id and sec.section = '01'
where sch.user_id = 'd0000000-0000-4000-8000-000000000001' and sch.name = 'My Schedule';
