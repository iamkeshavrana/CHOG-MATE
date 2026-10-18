-- Extend the existing Supabase schema without replacing existing profile data.
-- The legacy selected_chog_token_id is retained for safe rollback; application
-- reads and writes use active_chog_token_id after this migration.
alter table public.profiles
  add column if not exists active_chog_token_id text,
  add column if not exists hobbies text[] not null default '{}',
  add column if not exists languages text[] not null default '{}';

update public.profiles
set active_chog_token_id = selected_chog_token_id
where active_chog_token_id is null
  and selected_chog_token_id is not null;

alter table public.chogs
  add column if not exists tier text,
  add column if not exists metadata jsonb;

update public.chogs as chog
set tier = trait.trait_value
from public.chog_traits as trait
where trait.chog_id = chog.id
  and lower(trim(trait.trait_type)) = 'tier'
  and chog.tier is null;

