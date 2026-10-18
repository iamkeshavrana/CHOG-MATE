-- CHOG MATE schema. Run this in the linked Supabase project's SQL editor.
-- All verified ownership writes are made by the server after an on-chain check.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  wallet_address text not null unique,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  bio text,
  location text,
  timezone text,
  looking_for text[] not null default '{}',
  interests text[] not null default '{}',
  skills text[] not null default '{}',
  profile_visible boolean not null default true,
  selected_chog_token_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chogs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  contract_address text not null,
  token_id text not null,
  image_url text,
  metadata_url text,
  owner_wallet text not null,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_address, token_id)
);

create table if not exists public.chog_traits (
  id uuid primary key default gen_random_uuid(),
  chog_id uuid not null references public.chogs(id) on delete cascade,
  trait_type text not null,
  trait_value text not null,
  rarity numeric check (rarity is null or (rarity >= 0 and rarity <= 100)),
  unique (chog_id, trait_type, trait_value)
);

create table if not exists public.preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  mode text not null default 'discover' check (mode in ('discover', 'date', 'friends', 'network', 'collab')),
  looking_for text[] not null default '{}',
  interests text[] not null default '{}',
  skills text[] not null default '{}',
  timezone text,
  min_compatibility integer not null default 0 check (min_compatibility between 0 and 100),
  profile_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create table if not exists public.super_likes (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  compatibility_score integer not null default 0 check (compatibility_score between 0 and 100),
  status text not null default 'active' check (status in ('active', 'unmatched')),
  unmatched_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_activity timestamptz,
  unique (user_a, user_b),
  check (user_a < user_b),
  check (user_a <> user_b)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  type text not null check (type in ('like', 'super_like', 'match', 'message', 'call', 'missed_call')),
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'fake_profile', 'scam', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  check (reporter_id <> target_user_id)
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  caller_id uuid not null references public.users(id) on delete cascade,
  receiver_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('audio', 'video')),
  status text not null default 'calling' check (status in ('calling', 'connecting', 'connected', 'ended', 'rejected', 'missed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists profiles_visible_updated_idx on public.profiles (profile_visible, updated_at desc);
create index if not exists chogs_user_verified_idx on public.chogs (user_id, verified);
create index if not exists messages_match_created_idx on public.messages (match_id, created_at desc);
create index if not exists matches_user_a_activity_idx on public.matches (user_a, status, last_activity desc);
create index if not exists matches_user_b_activity_idx on public.matches (user_b, status, last_activity desc);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists blocks_blocked_user_idx on public.blocks (blocked_user_id);

create or replace function public.record_swipe(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_action text,
  p_compatibility integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_match_id uuid;
  v_new_match_id uuid;
  v_user_a uuid;
  v_user_b uuid;
  v_mutual boolean := false;
begin
  if p_from_user_id = p_to_user_id or p_action not in ('pass', 'like', 'super_like') then
    raise exception 'invalid swipe';
  end if;

  delete from public.likes where from_user_id = p_from_user_id and to_user_id = p_to_user_id;
  delete from public.passes where from_user_id = p_from_user_id and to_user_id = p_to_user_id;
  delete from public.super_likes where from_user_id = p_from_user_id and to_user_id = p_to_user_id;

  if p_action = 'pass' then
    insert into public.passes (from_user_id, to_user_id) values (p_from_user_id, p_to_user_id)
    on conflict (from_user_id, to_user_id) do update set created_at = now();
  elsif p_action = 'like' then
    insert into public.likes (from_user_id, to_user_id) values (p_from_user_id, p_to_user_id)
    on conflict (from_user_id, to_user_id) do update set created_at = now();
  else
    insert into public.super_likes (from_user_id, to_user_id) values (p_from_user_id, p_to_user_id)
    on conflict (from_user_id, to_user_id) do update set created_at = now();
  end if;

  if p_action in ('like', 'super_like') then
    select exists (
      select 1 from public.likes where from_user_id = p_to_user_id and to_user_id = p_from_user_id
      union all
      select 1 from public.super_likes where from_user_id = p_to_user_id and to_user_id = p_from_user_id
    ) into v_mutual;
  end if;

  if v_mutual then
    v_user_a := least(p_from_user_id, p_to_user_id);
    v_user_b := greatest(p_from_user_id, p_to_user_id);
    insert into public.matches (user_a, user_b, compatibility_score, last_activity)
    values (v_user_a, v_user_b, greatest(0, least(100, p_compatibility)), now())
    on conflict (user_a, user_b) do nothing
    returning id into v_new_match_id;

    if v_new_match_id is not null then
      v_match_id := v_new_match_id;
      insert into public.notifications (user_id, actor_id, type, related_id)
      values (p_to_user_id, p_from_user_id, 'match', v_match_id),
             (p_from_user_id, p_to_user_id, 'match', v_match_id);
    else
      select id into v_match_id
      from public.matches
      where user_a = v_user_a and user_b = v_user_b;
    end if;
  end if;

  return jsonb_build_object('matched', v_mutual, 'matchId', v_match_id);
end;
$$;

revoke all on function public.record_swipe(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.record_swipe(uuid, uuid, text, integer) to service_role;

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.chogs enable row level security;
alter table public.chog_traits enable row level security;
alter table public.preferences enable row level security;
alter table public.likes enable row level security;
alter table public.passes enable row level security;
alter table public.super_likes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.calls enable row level security;

grant select, insert, update, delete on table
  public.users,
  public.profiles,
  public.chogs,
  public.chog_traits,
  public.preferences,
  public.likes,
  public.passes,
  public.super_likes,
  public.matches,
  public.messages,
  public.notifications,
  public.reports,
  public.blocks,
  public.calls
to authenticated;

grant all privileges on table
  public.users,
  public.profiles,
  public.chogs,
  public.chog_traits,
  public.preferences,
  public.likes,
  public.passes,
  public.super_likes,
  public.matches,
  public.messages,
  public.notifications,
  public.reports,
  public.blocks,
  public.calls
to service_role;

drop policy if exists users_read_self on public.users;
create policy users_read_self on public.users for select to authenticated using (id = auth.uid());
drop policy if exists profiles_read_visible on public.profiles;
create policy profiles_read_visible on public.profiles for select to authenticated using (profile_visible or user_id = auth.uid());
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check (user_id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists chogs_read_verified on public.chogs;
create policy chogs_read_verified on public.chogs for select to authenticated using (verified or user_id = auth.uid());
drop policy if exists traits_read_verified on public.chog_traits;
create policy traits_read_verified on public.chog_traits for select to authenticated using (
  exists (select 1 from public.chogs c where c.id = chog_id and (c.verified or c.user_id = auth.uid()))
);
drop policy if exists preferences_manage_self on public.preferences;
create policy preferences_manage_self on public.preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists likes_read_participant on public.likes;
create policy likes_read_participant on public.likes for select to authenticated using (from_user_id = auth.uid() or to_user_id = auth.uid());
drop policy if exists likes_insert_self on public.likes;
create policy likes_insert_self on public.likes for insert to authenticated with check (from_user_id = auth.uid());
drop policy if exists passes_manage_self on public.passes;
create policy passes_manage_self on public.passes for all to authenticated using (from_user_id = auth.uid()) with check (from_user_id = auth.uid());
drop policy if exists super_likes_manage_self on public.super_likes;
create policy super_likes_manage_self on public.super_likes for all to authenticated using (from_user_id = auth.uid()) with check (from_user_id = auth.uid());
drop policy if exists matches_read_participant on public.matches;
create policy matches_read_participant on public.matches for select to authenticated using (user_a = auth.uid() or user_b = auth.uid());
drop policy if exists messages_read_match_member on public.messages;
create policy messages_read_match_member on public.messages for select to authenticated using (
  exists (select 1 from public.matches m where m.id = match_id and m.status = 'active' and auth.uid() in (m.user_a, m.user_b))
);
drop policy if exists messages_insert_match_member on public.messages;
create policy messages_insert_match_member on public.messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (
    select 1 from public.matches m where m.id = match_id and m.status = 'active' and auth.uid() in (m.user_a, m.user_b)
  )
);
drop policy if exists notifications_read_self on public.notifications;
create policy notifications_read_self on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists reports_manage_self on public.reports;
create policy reports_manage_self on public.reports for all to authenticated using (reporter_id = auth.uid()) with check (reporter_id = auth.uid());
drop policy if exists blocks_manage_self on public.blocks;
create policy blocks_manage_self on public.blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
drop policy if exists calls_read_participant on public.calls;
create policy calls_read_participant on public.calls for select to authenticated using (caller_id = auth.uid() or receiver_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
