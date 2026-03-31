# Tennis Point Tracker App

A tennis scoring and analytics web app built with Next.js + Supabase.

## Features

- Live point-by-point scoring for singles and doubles
- Public spectator mode (`/match/[id]/live`) with auto-updating scoreboard
- VIP Team Chat for spectators (Supabase Realtime)
- Match stats page with pressure metrics (break points, match points)
- Team leaderboard with sortable player analytics
- Bilingual UI (English / Traditional Chinese)

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase (Postgres + Auth + Realtime)

## Local Development

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3) Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database / Migrations

SQL migrations are in `supabase/` and are intended to be applied in order.

Key recent migrations:

- `10_add_spectator_public_to_matches.sql` - public spectator toggle
- `15_add_stream_url_to_matches.sql` - stream URL support in live spectator view
- `16_chat_messages.sql` - spectator VIP chat table + RLS + realtime publication

> Notes:
> - `chat_messages` is designed for anonymous spectator read/write on public matches only (via RLS policies).
> - Realtime insert events are enabled for `public.chat_messages`.

## Scripts

```bash
npm run dev    # start dev server
npm run build  # production build
npm run start  # run production server
npm run lint   # run eslint
```
