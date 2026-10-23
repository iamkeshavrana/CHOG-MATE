-- Keep call durations accurate and allow participant-only Realtime delivery.
alter table public.calls
  add column if not exists connected_at timestamptz;

grant select on table public.call_signals to authenticated;

drop policy if exists call_signals_read_participant on public.call_signals;
create policy call_signals_read_participant
  on public.call_signals
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.calls c
      where c.id = call_signals.call_id
        and (c.caller_id = auth.uid() or c.receiver_id = auth.uid())
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'calls'
    ) then
      alter publication supabase_realtime add table public.calls;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'call_signals'
    ) then
      alter publication supabase_realtime add table public.call_signals;
    end if;
  end if;
end;
$$;
