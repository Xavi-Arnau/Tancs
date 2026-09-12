import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getGameState } from "@/api/games";
import { getGameIdentity, setLastSeenTurnNumber } from "@/identity/playerToken";

function initialSince(gameId: string | undefined): number {
  return gameId ? (getGameIdentity(gameId)?.lastSeenTurnNumber ?? 0) : 0;
}

export function useGameState(gameId: string | undefined, token: string | undefined) {
  // `since` deliberately lives in a ref, NOT the query key: keying on it (as a previous version
  // of this hook did) meant every distinct `since` value got its own permanent entry in React
  // Query's cache — including the very first one (since=0), whose response dates from whenever
  // the page first loaded, potentially mid-buy-phase. combined with `placeholderData:
  // keepPreviousData` below, anything that recomputed `since` back to an old value would
  // instantly resurface that old cached snapshot (e.g. a stale "buy_phase" game) before a
  // background refetch corrected it. Keeping the key stable means there's only ever ONE cached
  // entry per game, always updated in place, so a stale historical snapshot can't exist to
  // resurface. `markSeen` updates the ref then explicitly refetches, instead of relying on a key
  // change to trigger the next fetch.
  const sinceRef = useRef(initialSince(gameId));

  useEffect(() => {
    sinceRef.current = initialSince(gameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const query = useQuery({
    queryKey: ["gameState", gameId],
    queryFn: () => getGameState(gameId!, token!, sinceRef.current),
    enabled: Boolean(gameId && token),
    refetchInterval: (q) => (q.state.data?.game.status === "game_over" ? false : 5000),
    // Keep showing the last-known data while a refetch is in flight — without this, refetching
    // would briefly clear `data`, causing GameView to unmount the live BattleView (and any
    // in-progress shot animation) for a "Loading..." flash.
    placeholderData: keepPreviousData,
  });

  function markSeen(turnNumber: number) {
    if (!gameId) return;
    setLastSeenTurnNumber(gameId, turnNumber);
    sinceRef.current = turnNumber;
    query.refetch();
  }

  return { ...query, markSeen };
}
