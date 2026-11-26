-- LOCAL DEVELOPMENT ONLY. Runs after seeds/2026FA-catalog.sql.
-- Puts four non-conflicting Fall 2026 classes on the test student's "My Schedule"
-- (created by the first-login trigger in seed.sql), so the calendar isn't empty on sign-in.

insert into public.schedule_sections (schedule_id, section_id)
select sch.id, sec.id
from (values ('CPSCI 101', '02'), ('MATH 113', '01'), ('HIST 110', '01'), ('PSYCH 101', '04')) as pick(code, section)
join public.courses c on c.term_id = '2026FA' and c.code = pick.code
join public.sections sec on sec.course_id = c.id and sec.section = pick.section
join public.schedules sch on sch.term_id = '2026FA' and sch.name = 'My Schedule'
where sch.user_id = 'd0000000-0000-4000-8000-000000000001';
