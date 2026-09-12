import type { GameSummary, GameSummaryOk } from "@tancs/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGame, getGameSummaries } from "@/api/games";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listStoredGames, removeGameIdentity, saveGameIdentity } from "@/identity/playerToken";

function statusLabel(summary: GameSummaryOk): string {
  switch (summary.status) {
    case "waiting_for_player2":
      return "Waiting for opponent to join";
    case "buy_phase":
      return summary.isMyTurn ? "Your turn to buy weapons" : "Waiting for opponent to buy";
    case "battle_phase":
      return summary.isMyTurn ? "Your turn" : "Opponent's turn";
    case "game_over":
      if (summary.winnerIsMe === null) return "Game over — draw";
      return summary.winnerIsMe ? "You won" : "You lost";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function LobbyView() {
  const navigate = useNavigate();
  const [storedGames, setStoredGames] = useState(() => listStoredGames());
  const [displayName, setDisplayName] = useState("");
  const [vsCpu, setVsCpu] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const summariesQuery = useQuery({
    queryKey: ["gameSummaries", storedGames.map((g) => g.gameId)],
    queryFn: () => getGameSummaries(storedGames),
    enabled: storedGames.length > 0,
  });

  const summaryById = new Map<string, GameSummary>(
    (summariesQuery.data?.summaries ?? []).map((s) => [s.gameId, s]),
  );

  const sortedGames = [...storedGames].sort((a, b) => {
    const sa = summaryById.get(a.gameId);
    const sb = summaryById.get(b.gameId);
    const aTurn = sa?.ok && sa.isMyTurn ? 1 : 0;
    const bTurn = sb?.ok && sb.isMyTurn ? 1 : 0;
    return bTurn - aTurn;
  });

  const createMutation = useMutation({
    mutationFn: () => createGame(displayName || undefined, vsCpu),
    onSuccess: (res) => {
      saveGameIdentity(res.gameId, { token: res.playerToken, slot: 0 });
      navigate(`/game/${res.gameId}`);
    },
  });

  function confirmRemove() {
    if (!pendingRemoveId) return;
    removeGameIdentity(pendingRemoveId);
    setStoredGames((games) => games.filter((g) => g.gameId !== pendingRemoveId));
    setPendingRemoveId(null);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Tancs</h1>
        <p className="mt-1 text-muted-foreground">
          Turn-based tank artillery. Async, play with a friend.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New game</CardTitle>
          <CardDescription>
            Start a game and share the invite link with a friend.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="Your name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={vsCpu}
              onChange={(e) => setVsCpu(e.target.checked)}
            />
            Play vs CPU (for solo testing)
          </label>
          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending
              ? "Creating..."
              : vsCpu
                ? "Create game vs CPU"
                : "Create game"}
          </Button>
          {createMutation.isError && (
            <p className="text-sm text-destructive">{createMutation.error.message}</p>
          )}
        </CardContent>
      </Card>

      {storedGames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your games</CardTitle>
            <CardDescription>Games you've created or joined on this device.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {summariesQuery.isLoading && (
              <p className="text-sm text-muted-foreground">Loading your games...</p>
            )}
            {summariesQuery.isError && (
              <p className="text-sm text-destructive">Couldn't load your games right now.</p>
            )}
            {sortedGames.map(({ gameId }) => {
              const summary = summaryById.get(gameId);
              return (
                <div key={gameId} className="flex items-center gap-2">
                  <button
                    className="flex flex-1 flex-col items-start gap-1 rounded-md border border-input px-3 py-2 text-left text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => navigate(`/game/${gameId}`)}
                  >
                    {!summary ? (
                      <span className="font-mono text-xs text-muted-foreground">{gameId}</span>
                    ) : !summary.ok ? (
                      <span className="text-muted-foreground">Unavailable</span>
                    ) : (
                      <>
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="font-medium">
                            vs {summary.opponentDisplayName ?? "Opponent"}
                          </span>
                          {summary.isMyTurn && <Badge>Your turn</Badge>}
                        </div>
                        <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                          <span>{statusLabel(summary)}</span>
                          <span>{formatDate(summary.createdAt)}</span>
                        </div>
                        <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                          <span>
                            You: {summary.myHp} HP
                            {summary.opponentHp !== null && ` · Opponent: ${summary.opponentHp} HP`}
                          </span>
                          <span>{summary.latestTurnNumber} turns</span>
                        </div>
                      </>
                    )}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove game from list"
                    onClick={() => setPendingRemoveId(gameId)}
                  >
                    <XIcon />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={pendingRemoveId !== null}
        onOpenChange={(open) => !open && setPendingRemoveId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this game?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to access it from this device anymore. Only do this for games
              that are already finished (or abandoned) — if it's still in progress, your
              opponent will be left waiting for a turn that will never come.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
