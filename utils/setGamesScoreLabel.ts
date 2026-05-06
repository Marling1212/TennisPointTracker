/** Games won in this set before the game at `index` (first game ⇒ "0-0"). */
export function formatSetGamesScoreBeforeGameIndex(
  setGames: Array<{ winnerTeam: "teamA" | "teamB" | null }>,
  index: number,
): string {
  let a = 0;
  let b = 0;
  for (let i = 0; i < index; i += 1) {
    const w = setGames[i].winnerTeam;
    if (w === "teamA") a += 1;
    else if (w === "teamB") b += 1;
  }
  return `${a}-${b}`;
}
