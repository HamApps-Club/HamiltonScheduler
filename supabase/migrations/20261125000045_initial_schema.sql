-- Hamilton Scheduler: initial schema
--
-- Catalog (terms, courses, sections): readable by signed-in users, written only
--   by the import script using the secret key (service_role bypasses RLS).
-- User data (profiles, schedules, schedule_sections): each user sees only their own.
-- Sign-up is restricted in the database to Google accounts with @hamilton.edu emails.

-- Internal helper functions live here so they are NOT exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Catalog tables
-------------------------------------------------------------------------------

create table public.terms (
  id             text primary key check (id ~ '^[0-9]{4}(SP|SU|FA|WI)$'),  -- e.g. 2027SP
  name           text not null,                                           -- e.g. Spring 2027
  is_active      boolean not null default false,
  start_date     date not null,
  end_date       date not null,
  no_class_dates date[] not null default '{}',
  check (end_date >= start_date)
);

create table public.courses (
  id           bigint generated always as identity primary key,
  term_id      text not null references public.terms (id) on delete restrict,
  code         text not null,                 -- e.g. AFRST 113W
  title        text not null,
  department   text,
  credits      numeric(4, 2),
  description  text,
  cross_listed text[] not null default '{}',  -- other codes for the same course
  catalog_url  text,
  unique (term_id, code)
);
create index courses_term_idx on public.courses (term_id);

create table public.sections (
  id               bigint generated always as identity primary key,
  course_id        bigint not null references public.courses (id) on delete restrict,
  section          text not null,             -- e.g. 01
  instructors      text[] not null default '{}',
  days             text check (days ~ '^[MTWRFSU]*$'),  -- e.g. MWF, TR; null/empty = TBA
  start_time       time,
  end_time         time,
  building         text,
  room             text,
  capacity         integer check (capacity >= 0),
  status           text not null default 'open' check (status in ('open', 'closed', 'canceled')),
  unique (course_id, section),
  -- times are both blank (TBA) or both set, and end after start
  check ((start_time is null) = (end_time is null)),
  check (end_time is null or end_time > start_time)
);

-------------------------------------------------------------------------------
-- User tables
-------------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null unique,
  username   text not null unique,
  created_at timestamptz not null default now()
);

create table public.schedules (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  term_id    text not null references public.terms (id) on delete restrict,
  name       text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now()
);
-- Unique names per user per term (case-insensitive).
create unique index schedules_user_term_name_key
  on public.schedules (user_id, term_id, lower(btrim(name)));

create table public.schedule_sections (
  schedule_id bigint not null references public.schedules (id) on delete cascade,
  section_id  bigint not null references public.sections (id) on delete restrict,
  added_at    timestamptz not null default now(),
  primary key (schedule_id, section_id)
);
create index schedule_sections_section_idx on public.schedule_sections (section_id);

-------------------------------------------------------------------------------
-- Rules enforced by triggers
-------------------------------------------------------------------------------

-- At most 3 schedules per user per term.
create function private.enforce_schedule_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Serialize concurrent inserts for the same user + term.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text || ':' || new.term_id));
  if (select count(*) from public.schedules s
      where s.user_id = new.user_id and s.term_id = new.term_id and s.id <> new.id) >= 3 then
    raise exception 'You can have at most 3 schedules per term.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger schedules_limit
  before insert or update of user_id, term_id on public.schedules
  for each row execute function private.enforce_schedule_limit();

-- A schedule's owner and term can't be changed after creation.
create function private.lock_schedule_owner_term() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.term_id <> old.term_id then
    raise exception 'A schedule''s owner and term cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger schedules_lock_owner_term
  before update on public.schedules
  for each row execute function private.lock_schedule_owner_term();

-- A section can only be added to a schedule for the same term.
create function private.enforce_section_term() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1
    from public.schedules sch
    join public.courses c on c.term_id = sch.term_id
    join public.sections sec on sec.course_id = c.id
    where sch.id = new.schedule_id and sec.id = new.section_id
  ) then
    raise exception 'That section is not in this schedule''s term.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger schedule_sections_same_term
  before insert or update on public.schedule_sections
  for each row execute function private.enforce_section_term();

-------------------------------------------------------------------------------
-- Sign-up rules and first-login setup (triggers on auth.users)
-------------------------------------------------------------------------------

-- Only Google sign-ins with an @hamilton.edu email may create or keep an account.
create function private.enforce_hamilton_google() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@]+@hamilton\.edu$' then
    raise exception 'Only @hamilton.edu accounts can sign in.'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception 'Please sign in with Google.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger enforce_hamilton_google
  before insert or update of email on auth.users
  for each row execute function private.enforce_hamilton_google();

-- Give the current user "My Schedule" in every active term they have no schedule for.
-- Runs at first login, and the app can call it later when a new term becomes active.
create function private.create_default_schedules(p_user uuid) returns void
language sql set search_path = '' as $$
  insert into public.schedules (user_id, term_id, name)
  select p_user, t.id, 'My Schedule'
  from public.terms t
  where t.is_active
    and not exists (select 1 from public.schedules s
                    where s.user_id = p_user and s.term_id = t.id);
$$;

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, lower(new.email), split_part(lower(new.email), '@', 1));
  perform private.create_default_schedules(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Callable from the app: make sure the signed-in user has a schedule in each active term.
create function public.ensure_default_schedules() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  perform private.create_default_schedules(auth.uid());
end $$;

-------------------------------------------------------------------------------
-- Permissions. Nothing is exposed unless granted here; RLS then filters rows.
-------------------------------------------------------------------------------

revoke all on public.terms, public.courses, public.sections,
              public.profiles, public.schedules, public.schedule_sections
  from anon, authenticated;

grant select on public.terms, public.courses, public.sections to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.schedules to authenticated;
grant update (name) on public.schedules to authenticated;
grant select, insert, delete on public.schedule_sections to authenticated;

grant all on public.terms, public.courses, public.sections,
             public.profiles, public.schedules, public.schedule_sections to service_role;

revoke execute on function public.ensure_default_schedules() from public, anon;
grant execute on function public.ensure_default_schedules() to authenticated;

-------------------------------------------------------------------------------
-- Row Level Security: on for every table
-------------------------------------------------------------------------------

alter table public.terms             enable row level security;
alter table public.courses           enable row level security;
alter table public.sections          enable row level security;
alter table public.profiles          enable row level security;
alter table public.schedules         enable row level security;
alter table public.schedule_sections enable row level security;

-- Catalog: any signed-in user can read. No write policies, so only the
-- import script (secret key / service_role) can change it.
create policy "Signed-in users can read terms"
  on public.terms for select to authenticated using (true);
create policy "Signed-in users can read courses"
  on public.courses for select to authenticated using (true);
create policy "Signed-in users can read sections"
  on public.sections for select to authenticated using (true);

-- Profiles: read your own. Created by the sign-up trigger only.
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- Schedules: full control over your own, in any term (including past ones).
create policy "Users can read their own schedules"
  on public.schedules for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can create their own schedules"
  on public.schedules for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can rename their own schedules"
  on public.schedules for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users can delete their own schedules"
  on public.schedules for delete to authenticated
  using (user_id = (select auth.uid()));

-- Schedule sections: only inside schedules you own.
create policy "Users can read sections in their own schedules"
  on public.schedule_sections for select to authenticated
  using (exists (select 1 from public.schedules s
                 where s.id = schedule_id and s.user_id = (select auth.uid())));
create policy "Users can add sections to their own schedules"
  on public.schedule_sections for insert to authenticated
  with check (exists (select 1 from public.schedules s
                      where s.id = schedule_id and s.user_id = (select auth.uid())));
create policy "Users can remove sections from their own schedules"
  on public.schedule_sections for delete to authenticated
  using (exists (select 1 from public.schedules s
                 where s.id = schedule_id and s.user_id = (select auth.uid())));
