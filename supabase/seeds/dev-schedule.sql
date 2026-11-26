-- LOCAL DEVELOPMENT ONLY. Runs after the catalog seeds.
-- Puts four classes on the test student's "My Schedule" in each term (schedules are created
-- by the first-login trigger in seed.sql), so the calendar isn't empty on sign-in.
-- Each set was checked against every meeting (labs, final exams, part-semester dates): no clashes.
-- Fails loudly if a regenerated catalog no longer has one of these sections.

do $$
declare
  added integer;
begin
  insert into public.schedule_sections (schedule_id, section_id)
  select sch.id, sec.id
  from (values
    ('2026FA', 'CPSCI 101', '01'), ('2026FA', 'MATH 113', '02'), ('2026FA', 'PSYCH 101', '03'), ('2026FA', 'ECON 100', '06'),
    ('2027SP', 'CPSCI 102', '01'), ('2027SP', 'MATH 116', '01'), ('2027SP', 'PSYCH 101', '01'), ('2027SP', 'ECON 100', '01')
  ) as pick(term_id, code, section)
  join public.courses c on c.term_id = pick.term_id and c.code = pick.code
  join public.sections sec on sec.course_id = c.id and sec.section = pick.section
  join public.schedules sch on sch.term_id = pick.term_id and sch.name = 'My Schedule'
                           and sch.user_id = 'd0000000-0000-4000-8000-000000000001';
  get diagnostics added = row_count;
  if added <> 8 then
    raise exception 'dev-schedule.sql: added % of 8 test classes; a picked section is missing from the catalog seed. Pick another section.', added;
  end if;
end $$;
