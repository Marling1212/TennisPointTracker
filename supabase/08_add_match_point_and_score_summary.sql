-- Optional migration if not applied in Supabase dashboard yet.
alter table public.matches
  add column if not exists score_summary text;

alter table public.points
  add column if not exists is_match_point boolean not null default false;
