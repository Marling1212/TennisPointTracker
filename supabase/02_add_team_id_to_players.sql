-- 02_add_team_id_to_players.sql
-- Migration for existing projects where players.team_id does not yet exist.

-- Add team_id column if missing.
alter table public.players
add column if not exists team_id uuid;

-- Add foreign key constraint to teams if missing.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'players_team_id_fkey'
  ) then
    alter table public.players
    add constraint players_team_id_fkey
    foreign key (team_id) references public.teams(id) on delete cascade;
  end if;
end $$;

-- Helpful index for roster lookups by team.
create index if not exists idx_players_team_id on public.players(team_id);
