-- 01_schema.sql
-- Core relational schema for tennis live scoring.
-- This file is intended to be version-controlled and applied to Supabase/Postgres.

-- Enable pgcrypto for gen_random_uuid() if it is not already available.
create extension if not exists pgcrypto;

-- profiles: App-level user profile linked to Supabase Auth users, with customizable usernames.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  created_at timestamp with time zone default now()
);

-- teams: User-owned tennis teams for secure roster management.
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default now()
);

-- players: Stores player profile data used in team setup and analytics attribution.
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  nickname text not null,
  dominant_hand text check (dominant_hand in ('Right', 'Left')),
  created_at timestamp with time zone default now()
);

-- matches: Stores a top-level match record and human-readable side labels.
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_type text not null check (match_type in ('Singles', 'Doubles')),
  status text default 'In Progress',
  team_a_name text,
  team_b_name text,
  scoring_type text check (scoring_type in ('Standard', 'No-Ad')),
  sets_format text check (sets_format in ('1 Set', 'Best of 3 Sets', 'Tiebreak Only')),
  created_at timestamp with time zone default now()
);

-- points: The analytics event table; each row is one logged point within a match.
create table if not exists public.points (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  server_id uuid references public.players (id),
  point_winner_team text check (point_winner_team in ('teamA', 'teamB')),
  ending_type text check (ending_type in ('Winner', 'Unforced Error', 'Forced Error', 'Ace', 'Double Fault')),
  stroke_type text,
  created_at timestamp with time zone default now()
);

-- player_notes: Unlimited user-created notes for each player.
create table if not exists public.player_notes (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  note_text text not null,
  created_at timestamp with time zone default now()
);
