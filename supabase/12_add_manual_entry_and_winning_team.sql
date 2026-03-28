-- Historic manual matches (no points rows). Live-completed matches set winning_team at finish.

alter table public.matches
add column if not exists is_manual_entry boolean not null default false;

alter table public.matches
add column if not exists winning_team text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_winning_team_check'
  ) then
    alter table public.matches
    add constraint matches_winning_team_check
    check (winning_team is null or winning_team in ('teamA', 'teamB'));
  end if;
end $$;
