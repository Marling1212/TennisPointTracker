import type { Match, Player, PointEvent } from "@/types";

export const mockPlayers: Player[] = [
  {
    id: "alex-chen",
    first_name: "Alex",
    last_name: "Chen",
    nickname: "Ace Alex",
    display_name: "Alex Chen",
    dominant_hand: "right",
    preferred_position: "all_court",
    is_active: true,
    rating_ntrp: 4.0,
    birth_year: 2002,
    team_name: "Ridgeview Aces",
    created_at: "2026-03-01T08:30:00Z",
    updated_at: "2026-03-24T11:15:00Z",
  },
  {
    id: "mia-torres",
    first_name: "Mia",
    last_name: "Torres",
    nickname: "Lefty Mia",
    display_name: "Mia Torres",
    dominant_hand: "left",
    preferred_position: "baseline",
    is_active: true,
    rating_ntrp: 4.5,
    birth_year: 2001,
    team_name: "Ridgeview Aces",
    created_at: "2026-03-01T08:35:00Z",
    updated_at: "2026-03-24T11:20:00Z",
  },
  {
    id: "sam-patel",
    first_name: "Sam",
    last_name: "Patel",
    nickname: "Net Sam",
    display_name: "Sam Patel",
    dominant_hand: "right",
    preferred_position: "net",
    is_active: true,
    rating_ntrp: 3.5,
    birth_year: 2003,
    team_name: "Ridgeview Aces",
    created_at: "2026-03-01T08:40:00Z",
    updated_at: "2026-03-24T11:25:00Z",
  },
];

export const mockMatches: Match[] = [
  {
    id: "match-2026-03-26-a",
    match_type: "singles",
    scoring_format: "best_of_3_sets",
    team_id: "ridgeview-aces",
    player_ids: ["alex-chen", "mia-torres"],
    opponent_label: "Westlake Wildcats",
    status: "in_progress",
    current_set: 2,
    scoreline: "6-4, 2-3",
    server_id: "alex-chen",
    scheduled_at: "2026-03-26T15:00:00Z",
    started_at: "2026-03-26T15:08:00Z",
    created_at: "2026-03-26T14:00:00Z",
    updated_at: "2026-03-26T15:42:00Z",
  },
];

export const mockPointEvents: PointEvent[] = [
  {
    id: "pt-001",
    match_id: "match-2026-03-26-a",
    point_number: 47,
    server_id: "alex-chen",
    receiver_id: "mia-torres",
    first_serve_in: true,
    point_winner_id: "alex-chen",
    ending_type: "winner",
    stroke_type: "forehand",
    stroke_by_player_id: "alex-chen",
    rally_shot_count: 7,
    score_after_point: "30-15",
    created_at: "2026-03-26T15:38:12Z",
  },
  {
    id: "pt-002",
    match_id: "match-2026-03-26-a",
    point_number: 48,
    server_id: "alex-chen",
    receiver_id: "mia-torres",
    first_serve_in: false,
    second_serve_in: true,
    point_winner_id: "mia-torres",
    ending_type: "forced_error",
    stroke_type: "backhand",
    stroke_by_player_id: "alex-chen",
    rally_shot_count: 10,
    score_after_point: "30-30",
    created_at: "2026-03-26T15:39:06Z",
  },
  {
    id: "pt-003",
    match_id: "match-2026-03-26-a",
    point_number: 49,
    server_id: "alex-chen",
    receiver_id: "mia-torres",
    first_serve_in: false,
    second_serve_in: false,
    point_winner_id: "mia-torres",
    ending_type: "double_fault",
    stroke_type: "serve",
    stroke_by_player_id: "alex-chen",
    rally_shot_count: 0,
    score_after_point: "30-40",
    created_at: "2026-03-26T15:39:52Z",
  },
  {
    id: "pt-004",
    match_id: "match-2026-03-26-a",
    point_number: 50,
    server_id: "alex-chen",
    receiver_id: "mia-torres",
    first_serve_in: true,
    point_winner_id: "alex-chen",
    ending_type: "ace",
    stroke_type: "serve",
    stroke_by_player_id: "alex-chen",
    rally_shot_count: 0,
    score_after_point: "40-40",
    created_at: "2026-03-26T15:40:31Z",
  },
];

export const getAllPlayers = (): Player[] => mockPlayers;

export const getPlayerById = (id: string): Player | undefined => mockPlayers.find((player) => player.id === id);

export const getInProgressMatchesForPlayer = (playerId: string): Match[] =>
  mockMatches.filter((match) => match.status === "in_progress" && match.player_ids.includes(playerId));

export const getPointEventsForMatch = (matchId: string): PointEvent[] =>
  mockPointEvents.filter((point) => point.match_id === matchId);
