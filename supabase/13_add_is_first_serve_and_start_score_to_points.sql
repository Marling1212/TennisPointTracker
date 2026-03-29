-- Serve analytics + pressure score at point start (run in Supabase SQL Editor if not already applied).

alter table public.points
add column if not exists is_first_serve boolean;

alter table public.points
add column if not exists start_score text;
