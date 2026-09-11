import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createGame } from "@/api/games";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listStoredGameIds, saveGameIdentity } from "@/identity/playerToken";

export default function LobbyView() {
  const navigate = useNavigate();
  const [storedGameIds] = useState(() => listStoredGameIds());
  const [displayName, setDisplayName] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createGame(displayName || undefined),
    onSuccess: (res) => {
      saveGameIdentity(res.gameId, { token: res.playerToken, slot: 0 });
      navigate(`/game/${res.gameId}`);
    },
  });

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
          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating..." : "Create game"}
          </Button>
          {createMutation.isError && (
            <p className="text-sm text-destructive">{createMutation.error.message}</p>
          )}
        </CardContent>
      </Card>

      {storedGameIds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your games</CardTitle>
            <CardDescription>Games you've created or joined on this device.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {storedGameIds.map((gameId) => (
              <Button
                key={gameId}
                variant="outline"
                className="justify-start font-mono text-xs"
                onClick={() => navigate(`/game/${gameId}`)}
              >
                {gameId}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
