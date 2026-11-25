-- Run with: supabase test db
begin;
select plan(34);

-- ---------- Test data (as the database owner) ----------
-- Uses its own far-future terms so it works alongside sample or real data.
-- Other terms are deactivated for the test (rolled back at the end).
update public.terms set is_active = false;
insert into public.terms (id, name, is_active, start_date, end_date, no_class_dates) values
  ('2090SP', 'Spring 2027', true,  '2090-01-20', '2090-05-07', '{2090-03-15}'),
  ('2089FA', 'Fall 2026',   false, '2089-08-27', '2089-12-11', '{}');
insert into public.courses (term_id, code, title, department, credits) values
  ('2090SP', 'AFRST 113W', 'Intro to Africana Studies', 'Africana Studies', 1),
  ('2089FA', 'CPSCI 101',  'Intro to Computer Science', 'Computer Science', 1);
insert into public.sections (course_id, section, days, start_time, end_time, status)
  select id, '01', 'MWF', '09:00', '09:50', 'open' from public.courses where term_id = '2090SP' and code = 'AFRST 113W';
insert into public.sections (course_id, section, status)   -- TBA section (no days/time)
  select id, '02', 'open' from public.courses where term_id = '2090SP' and code = 'AFRST 113W';
insert into public.sections (course_id, section, days, start_time, end_time)
  select id, '01', 'TR', '10:00', '11:15' from public.courses where term_id = '2089FA' and code = 'CPSCI 101';

insert into public.academic_calendar (term_id, starts_on, ends_on, title, kind)
  values ('2090SP', '2090-03-13', '2090-03-28', 'Spring recess', 'recess');

-- ---------- Sign-up rules ----------
select throws_ok(
  $$insert into auth.users (id, email, raw_app_meta_data)
    values ('00000000-0000-0000-0000-0000000000a1', 'someone@gmail.com', '{"provider":"google"}')$$,
  '23514', 'Only @hamilton.edu accounts can sign in.',
  'non-Hamilton email is rejected');
select throws_ok(
  $$insert into auth.users (id, email, raw_app_meta_data)
    values ('00000000-0000-0000-0000-0000000000a2', 'x@nothamilton.edu', '{"provider":"google"}')$$,
  '23514', 'Only @hamilton.edu accounts can sign in.',
  'look-alike domain is rejected');
select throws_ok(
  $$insert into auth.users (id, email, raw_app_meta_data)
    values ('00000000-0000-0000-0000-0000000000a3', 'jdoe@hamilton.edu', '{"provider":"email"}')$$,
  '23514', 'Please sign in with Google.',
  'non-Google sign-in is rejected');

-- Two valid students sign up.
select lives_ok(
  $$insert into auth.users (id, email, raw_app_meta_data) values
    ('11111111-1111-1111-1111-111111111111', 'JDoe@Hamilton.edu', '{"provider":"google"}'),
    ('22222222-2222-2222-2222-222222222222', 'asmith@hamilton.edu', '{"provider":"google"}')$$,
  'Google + @hamilton.edu sign-up works');
select throws_ok(
  $$update auth.users set email = 'jdoe@gmail.com' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', 'Only @hamilton.edu accounts can sign in.',
  'changing email to a non-Hamilton address is rejected');

-- ---------- First-login setup ----------
select is((select username from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'jdoe', 'username is the part before @ (lowercased)');
select results_eq(
  $$select term_id, name from public.schedules where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('2090SP'::text, 'My Schedule'::text)$$,
  'one "My Schedule" created for each active term only');

-- ---------- Signed-out visitors see nothing ----------
set local role anon;
select is(public.health(), 'ok', 'anyone can call the health check');
select throws_ok($$select * from public.courses$$, '42501', null, 'anon cannot read courses');
select throws_ok($$select * from public.schedules$$, '42501', null, 'anon cannot read schedules');
select throws_ok($$select * from public.academic_calendar$$, '42501', null, 'anon cannot read the academic calendar');
reset role;

-- ---------- Student 1 (jdoe) ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.courses where term_id in ('2090SP','2089FA')), 2, 'student can read the catalog');
select is((select count(*)::int from public.sections s join public.courses c on c.id = s.course_id where c.term_id in ('2090SP','2089FA')), 3, 'student can read all sections');
select is((select count(*)::int from public.profiles), 1, 'student sees only their own profile');

select throws_ok($$update public.courses set title = 'hacked'$$,
  '42501', null, 'student cannot change courses');
select throws_ok($$insert into public.terms (id, name, start_date, end_date)
                   values ('2030SP', 'x', '2030-01-01', '2030-05-01')$$,
  '42501', null, 'student cannot add terms');
select throws_ok($$delete from public.sections$$, '42501', null, 'student cannot delete sections');
select is((select count(*)::int from public.academic_calendar where term_id = '2090SP'), 1, 'student can read the academic calendar');
select throws_ok($$delete from public.academic_calendar$$, '42501', null, 'student cannot change the academic calendar');

select lives_ok($$insert into public.schedules (term_id, name) values ('2090SP', 'Plan B')$$,
  'student can add a second schedule');
select throws_ok($$insert into public.schedules (term_id, name) values ('2090SP', 'plan b ')$$,
  '23505', null, 'duplicate schedule name in a term is rejected (case-insensitive)');
select lives_ok($$insert into public.schedules (term_id, name) values ('2090SP', 'Plan C')$$,
  'student can add a third schedule');
select throws_ok($$insert into public.schedules (term_id, name) values ('2090SP', 'Plan D')$$,
  '23514', 'You can have at most 3 schedules per term.', 'fourth schedule in a term is rejected');
select lives_ok($$insert into public.schedules (term_id, name) values ('2089FA', 'Old fall plan')$$,
  'student can still use a past (inactive) term');

select lives_ok(
  $$insert into public.schedule_sections (schedule_id, section_id)
    select s.id, sec.id from public.schedules s, public.sections sec
    join public.courses c on c.id = sec.course_id
    where s.name = 'My Schedule' and c.term_id = '2090SP' and c.code = 'AFRST 113W' and sec.section = '01'$$,
  'student can add a section to their schedule');
select throws_ok(
  $$insert into public.schedule_sections (schedule_id, section_id)
    select s.id, sec.id from public.schedules s, public.sections sec
    join public.courses c on c.id = sec.course_id
    where s.name = 'My Schedule' and c.term_id = '2089FA' and c.code = 'CPSCI 101'$$,
  '23514', 'That section is not in this schedule''s term.',
  'section from another term is rejected');
select throws_ok(
  $$insert into public.schedules (user_id, term_id, name)
    values ('22222222-2222-2222-2222-222222222222', '2089FA', 'sneaky')$$,
  '42501', null, 'student cannot create a schedule for someone else');
select lives_ok($$update public.schedules set name = 'Main plan' where name = 'My Schedule'$$,
  'student can rename their schedule');
select throws_ok($$update public.schedules set term_id = '2089FA' where name = 'Main plan'$$,
  '42501', null, 'student cannot move a schedule to another term');
reset role;

-- ---------- Student 2 (asmith) can't see or touch student 1's data ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select results_eq($$select name from public.schedules$$, $$values ('My Schedule'::text)$$,
  'other student sees only their own schedules');
select is((select count(*)::int from public.schedule_sections), 0,
  'other student cannot see someone else''s schedule sections');
select is_empty($$delete from public.schedules
                  where user_id = '11111111-1111-1111-1111-111111111111' returning id$$,
  'other student cannot delete someone else''s schedules');

-- ensure_default_schedules: a newly activated term gets a "My Schedule".
reset role;
update public.terms set is_active = true where id = '2089FA';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select lives_ok($$select public.ensure_default_schedules()$$, 'ensure_default_schedules runs');
select is((select count(*)::int from public.schedules where term_id = '2089FA'), 1,
  'newly active term gets "My Schedule"');
reset role;

select * from finish();
rollback;
