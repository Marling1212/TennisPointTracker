-- Public spectator URL (/match/:id/live) respects this flag in the app.
-- Default true so existing and in-progress matches stay visible after deploy.
-- For strict enforcement, add RLS so anon can only SELECT matches/points when spectator_public = true (or user owns the team).

alter table public.matches
add column if not exists spectator_public boolean not null default true;
