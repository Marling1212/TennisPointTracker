-- VIP Team Chat (spectator /match/:id/live). Anonymous spectators use the anon key.
-- Only matches with spectator_public = true can be read or written from chat.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_name text not null,
  content text not null,
  created_at timestamp with time zone not null default now(),
  constraint chat_messages_sender_name_len check (char_length(sender_name) <= 200),
  constraint chat_messages_content_len check (char_length(content) <= 2000)
);

create index if not exists chat_messages_match_id_created_at_idx
  on public.chat_messages (match_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_select_public_matches" on public.chat_messages;
create policy "chat_select_public_matches"
  on public.chat_messages
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.matches m
      where m.id = chat_messages.match_id
        and m.spectator_public is true
    )
  );

drop policy if exists "chat_insert_public_matches" on public.chat_messages;
create policy "chat_insert_public_matches"
  on public.chat_messages
  for insert
  to anon, authenticated
  with check (
    exists (
      select 1
      from public.matches m
      where m.id = chat_messages.match_id
        and m.spectator_public is true
    )
  );

-- Broadcast INSERTs to Supabase Realtime (spectator UI subscribes to postgres_changes).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
