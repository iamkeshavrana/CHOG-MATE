alter table public.profiles
  add column if not exists name text,
  add column if not exists gender text,
  add column if not exists age smallint check (age is null or age between 18 and 120);
