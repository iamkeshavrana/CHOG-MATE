-- Restore optional profile metadata read by Discover's ranking and compatibility logic.
alter table public.profiles
  add column if not exists location text,
  add column if not exists timezone text,
  add column if not exists skills text[] not null default '{}';
