import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { joinGame } from "@/api/games";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveGameIdentity } from "@/identity/playerToken";

export default function JoinGameView() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");

  const joinMutation = useMutation({
    mutationFn: () => joinGame(inviteToken!, displayName || undefined),
    onSuccess: (res) => {
      saveGameIdentity(res.gameId, { token: res.playerToken, slot: 1 });
      navigate(`/game/${res.gameId}`);
    },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Join game</CardTitle>
          <CardDescription>You've been invited to a game of Tancs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            placeholder="Your name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
            {joinMutation.isPending ? "Joining..." : "Join game"}
          </Button>
          {joinMutation.isError && (
            <p className="text-sm text-destructive">{joinMutation.error.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
