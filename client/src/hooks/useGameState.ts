import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getGameState } from "@/api/games";
import { getGameIdentity, setLastSeenTurnNumber } from "@/identity/playerToken";

function initialSince(gameId: string | undefined): number {
  return gameId ? (getGameIdentity(gameId)?.lastSeenTurnNumber ?? 0) : 0;
}

export function useGameState(gameId: string | undefined, token: string | undefined) {
  // `since` drives the query key directly (rather than being re-read from localStorage
  // on every render) so that markSeen's update is immediately reflected in the next
  // fetch — invalidating a query still refetches it with whatever key it was last
  // rendered with, so a localStorage-only update wouldn't actually change what's fetched.
  const [since, setSince] = useState(() => initialSince(gameId));

  useEffect(() => {
    setSince(initialSince(gameId));
  }, [gameId]);

  const query = useQuery({
    queryKey: ["gameState", gameId, since],
    queryFn: () => getGameState(gameId!, token!, since),
    enabled: Boolean(gameId && token),
    refetchInterval: (q) => (q.state.data?.game.status === "game_over" ? false : 5000),
    // Keep showing the last-known data while a since-change refetches in the background —
    // without this, bumping `since` (via markSeen) would briefly clear `data`, causing
    // GameView to unmount the live BattleView (and any in-progress shot animation) for a
    // "Loading..." flash.
    placeholderData: keepPreviousData,
  });

  function markSeen(turnNumber: number) {
    if (!gameId) return;
    setLastSeenTurnNumber(gameId, turnNumber);
    setSince(turnNumber);
  }

  return { ...query, markSeen };
}
