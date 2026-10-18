alter table public.super_likes
  add column if not exists transaction_hash text;

create unique index if not exists super_likes_transaction_hash_unique
  on public.super_likes (lower(transaction_hash))
  where transaction_hash is not null;

alter table public.reports
  drop constraint if exists reports_reason_check,
  add constraint reports_reason_check
    check (reason in ('spam', 'harassment', 'fake_profile', 'inappropriate_content', 'scam', 'other'));

drop function if exists public.record_swipe(uuid, uuid, text, integer);

create function public.record_swipe(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_action text,
  p_compatibility integer,
  p_transaction_hash text default null
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

  if p_action = 'super_like' and (
    p_transaction_hash is null
    or p_transaction_hash !~ '^0x[0-9a-fA-F]{64}$'
  ) then
    raise exception 'a confirmed Super Like transaction is required';
  end if;

  if p_action <> 'super_like' and p_transaction_hash is not null then
    raise exception 'unexpected transaction hash';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = p_from_user_id and blocked_user_id = p_to_user_id)
       or (blocker_id = p_to_user_id and blocked_user_id = p_from_user_id)
  ) then
    raise exception 'blocked interaction';
  end if;

  if exists (
    select 1 from public.likes where from_user_id = p_from_user_id and to_user_id = p_to_user_id
    union all
    select 1 from public.passes where from_user_id = p_from_user_id and to_user_id = p_to_user_id
    union all
    select 1 from public.super_likes where from_user_id = p_from_user_id and to_user_id = p_to_user_id
  ) then
    return jsonb_build_object('recorded', false, 'matched', false, 'matchId', null);
  end if;

  if p_action = 'pass' then
    insert into public.passes (from_user_id, to_user_id)
    values (p_from_user_id, p_to_user_id);
    return jsonb_build_object('recorded', true, 'matched', false, 'matchId', null);
  elsif p_action = 'like' then
    insert into public.likes (from_user_id, to_user_id)
    values (p_from_user_id, p_to_user_id);
    insert into public.notifications (user_id, actor_id, type, related_id)
    values (p_to_user_id, p_from_user_id, 'like', p_from_user_id);
  else
    insert into public.super_likes (from_user_id, to_user_id, transaction_hash)
    values (p_from_user_id, p_to_user_id, lower(p_transaction_hash));
    insert into public.notifications (user_id, actor_id, type, related_id)
    values (p_to_user_id, p_from_user_id, 'super_like', p_from_user_id);
  end if;

  select exists (
    select 1 from public.likes where from_user_id = p_to_user_id and to_user_id = p_from_user_id
    union all
    select 1 from public.super_likes where from_user_id = p_to_user_id and to_user_id = p_from_user_id
  ) into v_mutual;

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

  return jsonb_build_object(
    'recorded', true,
    'matched', v_mutual,
    'matchId', v_match_id
  );
end;
$$;

revoke all on function public.record_swipe(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_swipe(uuid, uuid, text, integer, text)
  to service_role;

drop policy if exists reports_manage_self on public.reports;
drop policy if exists reports_insert_self on public.reports;
create policy reports_insert_self on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and reporter_id <> target_user_id);

revoke update, delete on table public.reports from authenticated;
revoke update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
