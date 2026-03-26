-- Break point tagging (run in Supabase). serving_team = who served this point (break opportunity for the other team).
alter table public.points
  add column if not exists is_break_point boolean not null default false;

alter table public.points
  add column if not exists serving_team text;

create index if not exists points_match_break_idx on public.points (match_id)
  where is_break_point = true;
