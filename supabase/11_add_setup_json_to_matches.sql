-- Full lineup + rules used for live scoring, so /match/:id/play can resume without ?setup= in the URL.

alter table public.matches
add column if not exists setup_json jsonb;
