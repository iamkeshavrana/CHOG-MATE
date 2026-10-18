-- Keep interaction and transaction writes behind the API server. It validates
-- wallet identity, block rules, and confirmed Monad transfers before writing.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  tx_hash text not null unique
    check (tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  sender_user_id uuid not null references public.users(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  sender_wallet text not null,
  recipient_wallet text not null,
  token_contract text not null,
  amount numeric(78, 18) not null check (amount > 0),
  transaction_type text not null check (transaction_type in ('super_like', 'gift')),
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'failed')),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check (sender_user_id <> recipient_user_id)
);

create index if not exists transactions_sender_created_idx
  on public.transactions (sender_user_id, created_at desc);
create index if not exists transactions_recipient_created_idx
  on public.transactions (recipient_user_id, created_at desc);

alter table public.transactions enable row level security;
revoke all on table public.transactions from anon, authenticated;
grant select on table public.transactions to authenticated;
grant all privileges on table public.transactions to service_role;
drop policy if exists transactions_read_participant on public.transactions;
create policy transactions_read_participant on public.transactions
  for select to authenticated
  using (sender_user_id = auth.uid() or recipient_user_id = auth.uid());

alter table public.super_likes
  add column if not exists transaction_id uuid
    references public.transactions(id) on delete restrict;

-- Authenticated clients must not create interactions or alter server-owned
-- match/message state directly. The API uses service_role after validation.
revoke insert, update, delete on table
  public.likes,
  public.passes,
  public.super_likes,
  public.matches,
  public.messages,
  public.calls
from authenticated;
revoke all on table public.blocks, public.reports from authenticated;
revoke insert, delete on table public.notifications from authenticated;
revoke update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;

drop policy if exists likes_insert_self on public.likes;
drop policy if exists passes_manage_self on public.passes;
drop policy if exists super_likes_manage_self on public.super_likes;
drop policy if exists messages_insert_match_member on public.messages;
drop policy if exists blocks_manage_self on public.blocks;
drop policy if exists reports_insert_self on public.reports;

drop function if exists public.record_swipe(uuid, uuid, text, integer, text);

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
  v_transaction_id uuid;
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

  if p_action = 'super_like' and exists (
    select 1
    from public.transactions
    where tx_hash = lower(p_transaction_hash)
      and sender_user_id = p_from_user_id
      and recipient_user_id = p_to_user_id
      and transaction_type = 'super_like'
      and status = 'confirmed'
  ) then
    return jsonb_build_object('recorded', true, 'matched', false, 'matchId', null);
  end if;

  if p_action <> 'super_like' and exists (
    select 1 from public.likes where from_user_id = p_from_user_id and to_user_id = p_to_user_id
    union all
    select 1 from public.passes where from_user_id = p_from_user_id and to_user_id = p_to_user_id
    union all
    select 1 from public.super_likes where from_user_id = p_from_user_id and to_user_id = p_to_user_id
  ) then
    return jsonb_build_object('recorded', false, 'matched', false, 'matchId', null);
  end if;

  if p_action = 'pass' then
    insert into public.passes (from_user_id, to_user_id) values (p_from_user_id, p_to_user_id);
  elsif p_action = 'like' then
    insert into public.likes (from_user_id, to_user_id) values (p_from_user_id, p_to_user_id);
    insert into public.notifications (user_id, actor_id, type, related_id)
    values (p_to_user_id, p_from_user_id, 'like', p_from_user_id);
  else
    insert into public.transactions (
      tx_hash,
      sender_user_id,
      recipient_user_id,
      sender_wallet,
      recipient_wallet,
      token_contract,
      amount,
      transaction_type,
      status,
      confirmed_at
    )
    select
      lower(p_transaction_hash),
      sender.id,
      recipient.id,
      lower(sender.wallet_address),
      lower(recipient.wallet_address),
      '0x350035555e10d9afaf1566aaebfced5ba6c27777',
      100,
      'super_like',
      'confirmed',
      now()
    from public.users sender, public.users recipient
    where sender.id = p_from_user_id and recipient.id = p_to_user_id
    returning id into v_transaction_id;

    if v_transaction_id is null then
      raise exception 'transaction participants could not be verified';
    end if;

    delete from public.likes where from_user_id = p_from_user_id and to_user_id = p_to_user_id;
    delete from public.passes where from_user_id = p_from_user_id and to_user_id = p_to_user_id;
    insert into public.super_likes (
      from_user_id,
      to_user_id,
      transaction_hash,
      transaction_id
    )
    values (
      p_from_user_id,
      p_to_user_id,
      lower(p_transaction_hash),
      v_transaction_id
    )
    on conflict (from_user_id, to_user_id) do update
      set transaction_hash = excluded.transaction_hash,
          transaction_id = excluded.transaction_id,
          created_at = now();
    insert into public.notifications (user_id, actor_id, type, related_id)
    values (p_to_user_id, p_from_user_id, 'super_like', p_from_user_id);
  end if;

  -- A Super Like grants its own interaction state; only an explicit Like
  -- creates a Match, including when it is the recipient's Like Back.
  if p_action = 'like' then
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

  return jsonb_build_object('recorded', true, 'matched', v_mutual, 'matchId', v_match_id);
end;
$$;

revoke all on function public.record_swipe(uuid, uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_swipe(uuid, uuid, text, integer, text)
  to service_role;
