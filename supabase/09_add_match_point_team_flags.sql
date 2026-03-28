-- Per-team match point (server or receiver). Run in Supabase if not already applied.
alter table public.points
  add column if not exists match_point_team_a boolean not null default false;

alter table public.points
  add column if not exists match_point_team_b boolean not null default false;
