-- Richer section data.
--
-- sections.meetings: every meeting pattern (lecture + lab, half-semester dates).
--   days/start_time/end_time/building/room keep the primary meeting for simple queries.
-- sections.comments: registration notes, e.g. "Open to First Years and Sophomores only."
-- sections.status: adds 'waitlisted'.
-- academic_calendar: the college's academic calendar (breaks, deadlines, class dates).

-- Each element: {"days":"MW","start_time":"08:30","end_time":"09:45","building":"…","room":"…",
--                "type":"LEC","start_date":"2027-01-20","end_date":"2027-05-11"}
alter table public.sections
  add column meetings jsonb not null default '[]' check (jsonb_typeof(meetings) = 'array'),
  add column comments text;

alter table public.sections drop constraint sections_status_check;
alter table public.sections add constraint sections_status_check
  check (status in ('open', 'waitlisted', 'closed', 'canceled'));

-------------------------------------------------------------------------------
-- Academic calendar
-------------------------------------------------------------------------------

create table public.academic_calendar (
  id        bigint generated always as identity primary key,
  term_id   text not null references public.terms (id) on delete cascade,
  starts_on date not null,
  ends_on   date not null,
  title     text not null,
  kind      text not null check (kind in
              ('classes_begin', 'classes_end', 'recess', 'holiday', 'deadline',
               'reading_days', 'exams', 'registration', 'orientation', 'event')),
  time_note text,                      -- e.g. '4 p.m.'
  unique (term_id, starts_on, title),
  check (ends_on >= starts_on)
);
create index academic_calendar_term_idx on public.academic_calendar (term_id, starts_on);

revoke all on public.academic_calendar from anon, authenticated;
grant select on public.academic_calendar to authenticated;
grant all on public.academic_calendar to service_role;

alter table public.academic_calendar enable row level security;
create policy "Signed-in users can read the academic calendar"
  on public.academic_calendar for select to authenticated using (true);

-------------------------------------------------------------------------------
-- Health check (used by the daily keep-alive Lambda)
-------------------------------------------------------------------------------

-- Returns 'ok'. Reads no data; exists so a scheduled job can confirm the database is up
-- (and, as a side effect, keep the free project from pausing for inactivity).
create function public.health() returns text
language sql stable set search_path = '' as $$ select 'ok'::text $$;
revoke execute on function public.health() from public;
grant execute on function public.health() to anon, authenticated, service_role;
