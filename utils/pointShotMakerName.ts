import type { AppLanguage } from "@/lib/translations";
import { formatPlayerDisplayName } from "@/lib/playerNameFormat";

export type TeamTag = "teamA" | "teamB";

type PointLike = {
  point_winner_team: TeamTag | null;
  ending_type:
    | "Winner"
    | "Unforced Error"
    | "Forced Error"
    | "Ace"
    | "Service Winner"
    | "Double Fault"
    | string
    | null;
  serving_team?: TeamTag | null;
  server_id: string | null;
  action_player_id: string | null;
};

type PlayerLike = { first_name: string; last_name: string };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRosterUuid(id: string | null | undefined): id is string {
  return Boolean(id && UUID_REGEX.test(id));
}

/** Team credited with the decisive stroke (winner / error / serve / double fault). */
export function shotCreditTeam(point: PointLike): TeamTag | null {
  const wt = point.point_winner_team;
  const et = point.ending_type;
  if (!et) return null;

  if (et === "Winner") return wt;

  if (et === "Ace" || et === "Service Winner") {
    return point.serving_team ?? wt;
  }

  if (et === "Double Fault") {
    if (point.serving_team) return point.serving_team;
    if (wt) return wt === "teamA" ? "teamB" : "teamA";
    return null;
  }

  if (et === "Unforced Error" || et === "Forced Error") {
    if (!wt) return null;
    return wt === "teamA" ? "teamB" : "teamA";
  }

  return null;
}

function rosterName(
  playerId: string | null,
  players: Record<string, PlayerLike>,
  language: AppLanguage,
): string | null {
  if (!isRosterUuid(playerId)) return null;
  const p = players[playerId];
  if (!p) return null;
  return formatPlayerDisplayName(p.first_name, p.last_name, language);
}

function teamFallbackName(
  side: TeamTag,
  teamALabel: string,
  teamBLabel: string,
  setupA: string[],
  setupB: string[],
): string {
  const names = side === "teamA" ? setupA : setupB;
  if (names.length === 1) return names[0];
  if (names.length >= 2) return `${names[0]} / ${names[1]}`;
  return side === "teamA" ? teamALabel : teamBLabel;
}

/**
 * Who hit the credited shot for this point (roster name, setup names, or team label).
 */
export function resolveShotMakerDisplayName(
  point: PointLike,
  ctx: {
    players: Record<string, PlayerLike>;
    language: AppLanguage;
    teamALabel: string;
    teamBLabel: string;
    setupTeamA: string[];
    setupTeamB: string[];
    unknownLabel: string;
  },
): string {
  const fromAction = rosterName(point.action_player_id, ctx.players, ctx.language);
  if (fromAction) return fromAction;

  const et = point.ending_type;
  if (et === "Ace" || et === "Service Winner" || et === "Double Fault") {
    const fromServer = rosterName(point.server_id, ctx.players, ctx.language);
    if (fromServer) return fromServer;
  }

  const side = shotCreditTeam(point);
  if (!side) return ctx.unknownLabel;

  return teamFallbackName(side, ctx.teamALabel, ctx.teamBLabel, ctx.setupTeamA, ctx.setupTeamB);
}
