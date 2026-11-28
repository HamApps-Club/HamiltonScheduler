-- Prerequisites and corequisites, as written on each course's page in the public Hamilton
-- catalogue (e.g. 'CHEM 120', 'CHEM 190L'). Plain text for students to read; the app never
-- enforces them. Filled by the course import from data/catalog-requisites.json
-- (scripts/scrape-catalog-requisites.ts); null = none listed, or the course has no catalogue page.

alter table public.courses
  add column prerequisites text,
  add column corequisites  text;
