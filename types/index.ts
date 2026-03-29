export type DominantHand = "right" | "left";

export type MatchType = "singles" | "doubles";

export type ScoringFormat = "best_of_3_sets" | "best_of_5_sets" | "pro_set" | "tiebreak_10";

export type MatchStatus = "scheduled" | "in_progress" | "completed" | "retired" | "cancelled";

export type PointEndingType =
  | "winner"
  | "unforced_error"
  | "forced_error"
  | "ace"
  | "service_winner"
  | "double_fault";

export type StrokeType = "forehand" | "backhand" | "volley" | "overhead" | "serve" | "return";

export interface Player {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  display_name: string;
  dominant_hand: DominantHand;
  preferred_position?: "baseline" | "all_court" | "net";
  is_active: boolean;
  rating_ntrp?: number;
  birth_year?: number;
  team_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Match {
  id: string;
  match_type: MatchType;
  scoring_format: ScoringFormat;
  team_id: string;
  player_ids: string[];
  opponent_label: string;
  status: MatchStatus;
  current_set: number;
  scoreline: string;
  server_id: string;
  scheduled_at?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PointEvent {
  id: string;
  match_id: string;
  point_number: number;
  server_id: string;
  receiver_id: string;
  first_serve_in: boolean;
  second_serve_in?: boolean;
  point_winner_id: string;
  ending_type: PointEndingType;
  stroke_type?: StrokeType;
  stroke_by_player_id?: string;
  rally_shot_count: number;
  score_after_point: string;
  created_at: string;
}
