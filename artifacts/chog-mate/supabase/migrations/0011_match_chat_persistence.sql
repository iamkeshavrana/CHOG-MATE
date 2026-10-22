-- A block ends an active match but must never create an Ex Match entry.
update public.matches m
set unmatched_by = null
where m.status = 'unmatched'
  and exists (
    select 1
    from public.blocks b
    where (b.blocker_id = m.user_a and b.blocked_user_id = m.user_b)
       or (b.blocker_id = m.user_b and b.blocked_user_id = m.user_a)
  );

-- Keep stored chat history readable after an unmatch, but never across a block.
drop policy if exists messages_read_match_member on public.messages;
create policy messages_read_match_member on public.messages
for select to authenticated using (
  exists (
    select 1
    from public.matches m
    where m.id = match_id
      and m.status in ('active', 'unmatched')
      and auth.uid() in (m.user_a, m.user_b)
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = m.user_a and b.blocked_user_id = m.user_b)
           or (b.blocker_id = m.user_b and b.blocked_user_id = m.user_a)
      )
  )
);

drop policy if exists messages_insert_match_member on public.messages;
create policy messages_insert_match_member on public.messages
for insert to authenticated with check (
  sender_id = auth.uid() and exists (
    select 1
    from public.matches m
    where m.id = match_id
      and m.status in ('active', 'unmatched')
      and auth.uid() in (m.user_a, m.user_b)
      and not exists (
        select 1
        from public.blocks b
        where (b.blocker_id = m.user_a and b.blocked_user_id = m.user_b)
           or (b.blocker_id = m.user_b and b.blocked_user_id = m.user_a)
      )
  )
);

-- Reactivate the existing pair row, and only for the user who unmatched.
create or replace function public.rematch_match(p_match_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_other_user_id uuid;
begin
  select case when user_a = p_user_id then user_b else user_a end
    into v_other_user_id
  from public.matches
  where id = p_match_id
    and p_user_id in (user_a, user_b)
    and status = 'unmatched'
    and unmatched_by = p_user_id
  for update;

  if not found then
    return false;
  end if;

  if exists (
    select 1
    from public.blocks
    where (blocker_id = p_user_id and blocked_user_id = v_other_user_id)
       or (blocker_id = v_other_user_id and blocked_user_id = p_user_id)
  ) then
    return false;
  end if;

  update public.matches
  set status = 'active',
      unmatched_by = null,
      last_activity = now()
  where id = p_match_id;

  return found;
end;
$$;

revoke all on function public.rematch_match(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rematch_match(uuid, uuid) to service_role;
