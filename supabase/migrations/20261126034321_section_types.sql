-- Course types from Colleague Self-Service, per section (they can differ between sections of
-- one course, e.g. a first-years-only section of MATH 113).
--
-- Values are Self-Service's own labels, e.g. 'Writing Intensive Courses',
-- 'Quantitative & Symbolic R', 'Speaking Intensive Course', 'First Year Courses', 'Proseminar'.
-- Internal tags ('Tour Exclude', 'Fac Eval Exclude', 'Do Not Show') are dropped by the importer.
-- The app filters on these in the browser (see README: "Adding a search filter").

alter table public.sections
  add column types text[] not null default '{}';
