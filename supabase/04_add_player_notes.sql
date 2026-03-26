-- 04_add_player_notes.sql
-- Migration for adding unlimited per-player notes.

create table if not exists public.player_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  note_text text not null,
  created_at timestamp with time zone default now()
);

create index if not exists idx_player_notes_player_id_created_at
on public.player_notes (player_id, created_at desc);
