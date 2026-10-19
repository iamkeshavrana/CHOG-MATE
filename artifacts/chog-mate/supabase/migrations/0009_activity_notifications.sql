-- Keep notifications in step with call and confirmed gift events. Transaction
-- rows are written only by the trusted API, and call writes remain server-owned.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('like', 'super_like', 'match', 'message', 'call', 'missed_call', 'gift'));

alter table public.notifications
  add column if not exists amount numeric(78, 18)
    check (amount is null or amount > 0);

create unique index if not exists notifications_gift_transaction_unique
  on public.notifications (user_id, type, related_id)
  where type = 'gift';

create or replace function public.notify_call_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'missed' then
      insert into public.notifications (user_id, actor_id, type, related_id)
      values (new.receiver_id, new.caller_id, 'missed_call', new.match_id);
    elsif new.status in ('calling', 'connecting') then
      insert into public.notifications (user_id, actor_id, type, related_id)
      values (new.receiver_id, new.caller_id, 'call', new.match_id);
    end if;
  elsif new.status is distinct from old.status and new.status = 'missed' then
    insert into public.notifications (user_id, actor_id, type, related_id)
    values (new.receiver_id, new.caller_id, 'missed_call', new.match_id);
  end if;
  return new;
end;
$$;

drop trigger if exists calls_notify_activity on public.calls;
create trigger calls_notify_activity
  after insert or update of status on public.calls
  for each row execute function public.notify_call_activity();

create or replace function public.notify_confirmed_gift()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  should_notify boolean := false;
begin
  if tg_op = 'INSERT' then
    should_notify := new.transaction_type = 'gift' and new.status = 'confirmed';
  elsif tg_op = 'UPDATE' then
    should_notify :=
      new.transaction_type = 'gift'
      and new.status = 'confirmed'
      and new.status is distinct from old.status;
  end if;

  if should_notify then
    insert into public.notifications (user_id, actor_id, type, related_id, amount)
    values (
      new.recipient_user_id,
      new.sender_user_id,
      'gift',
      new.id,
      new.amount
    )
    on conflict (user_id, type, related_id) where type = 'gift' do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_notify_confirmed_gift on public.transactions;
create trigger transactions_notify_confirmed_gift
  after insert or update of status on public.transactions
  for each row execute function public.notify_confirmed_gift();
