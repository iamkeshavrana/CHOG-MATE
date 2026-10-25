-- Keep the verified, one-sided Super Like flow recoverable and idempotent.
-- The API verifies the transaction before calling this function.
create or replace function public.record_swipe(
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
  v_duplicate_super_like boolean := false;
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

  if p_action = 'super_like' then
    select exists (
      select 1
      from public.transactions
      where lower(tx_hash) = lower(p_transaction_hash)
        and sender_user_id = p_from_user_id
        and recipient_user_id = p_to_user_id
        and transaction_type = 'super_like'
        and status = 'confirmed'
    ) into v_duplicate_super_like;
  elsif exists (
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
  elsif p_action = 'like' then
    insert into public.likes (from_user_id, to_user_id)
    values (p_from_user_id, p_to_user_id);
    insert into public.notifications (user_id, actor_id, type, related_id)
    values (p_to_user_id, p_from_user_id, 'like', p_from_user_id);
  else
    if not v_duplicate_super_like then
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
      on conflict (tx_hash) do nothing
      returning id into v_transaction_id;

      if v_transaction_id is null then
        select id into v_transaction_id
        from public.transactions
        where lower(tx_hash) = lower(p_transaction_hash)
          and sender_user_id = p_from_user_id
          and recipient_user_id = p_to_user_id
          and transaction_type = 'super_like'
          and status = 'confirmed';

        if v_transaction_id is null then
          raise exception 'transaction hash is already assigned to a different transfer';
        end if;
        v_duplicate_super_like := true;
      end if;

      if not v_duplicate_super_like then
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
    end if;

    v_mutual := true;
  end if;

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
    insert into public.matches as existing_match (
      user_a,
      user_b,
      compatibility_score,
      status,
      unmatched_by,
      last_activity
    )
    values (
      v_user_a,
      v_user_b,
      greatest(0, least(100, p_compatibility)),
      'active',
      null,
      now()
    )
    on conflict (user_a, user_b) do update
      set compatibility_score = excluded.compatibility_score,
          status = 'active',
          unmatched_by = null,
          last_activity = now()
      where existing_match.status <> 'active'
         or existing_match.unmatched_by is not null
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
