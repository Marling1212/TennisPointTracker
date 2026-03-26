-- 05_add_match_rule_columns.sql
-- Add scoring_type and sets_format rule columns to matches.

alter table public.matches
add column if not exists scoring_type text;

alter table public.matches
add column if not exists sets_format text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_scoring_type_check'
  ) then
    alter table public.matches
    add constraint matches_scoring_type_check
    check (scoring_type in ('Standard', 'No-Ad'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'matches_sets_format_check'
  ) then
    alter table public.matches
    add constraint matches_sets_format_check
    check (sets_format in ('1 Set', 'Best of 3 Sets', 'Tiebreak Only'));
  end if;
end $$;
