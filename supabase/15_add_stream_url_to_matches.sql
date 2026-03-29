-- Optional Facebook (or other) video URL for the public spectator /live embed.

alter table public.matches
add column if not exists stream_url text;

comment on column public.matches.stream_url is 'Public video page URL for spectator embed (e.g. Facebook Live / replay).';
