-- 03_add_nickname_to_players.sql
-- Migration for adding nickname support to existing players rows.

alter table public.players
add column if not exists nickname text;

-- Backfill existing rows with a generated nickname if missing.
update public.players
set nickname = coalesce(nullif(trim(first_name || ' ' || last_name), ''), 'Player')
where nickname is null or trim(nickname) = '';

-- Enforce that every player has a nickname going forward.
alter table public.players
alter column nickname set not null;
