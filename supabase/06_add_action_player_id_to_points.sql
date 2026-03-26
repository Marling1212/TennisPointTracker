-- Run in Supabase SQL editor (or migrate) to add per-player attribution on points.
alter table public.points
  add column if not exists action_player_id uuid references public.players (id);

create index if not exists points_action_player_id_idx on public.points (action_player_id);
