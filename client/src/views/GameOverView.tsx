import type { GameDoc } from "@tancs/shared";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createGame } from "@/api/games";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveGameIdentity } from "@/identity/playerToken";
import TerrainCanvas from "@/game/TerrainCanvas";

interface Props {
  game: GameDoc;
  mySlot: 0 | 1;
}

export default function GameOverView({ game, mySlot }: Props) {
  const navigate = useNavigate();
  const me = game.players[mySlot];
  const won = game.winnerPlayerId === me.playerId;
  const draw = game.winnerPlayerId === null;

  const rematchMutation = useMutation({
    mutationFn: () => createGame(),
    onSuccess: (res) => {
      saveGameIdentity(res.gameId, { token: res.playerToken, slot: 0 });
      navigate(`/game/${res.gameId}`);
    },
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {draw ? "It's a draw!" : won ? "You won!" : "You were destroyed"}
          </CardTitle>
          <CardDescription>The battle has ended.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <TerrainCanvas terrain={game.terrain} players={game.players} />
          <Button onClick={() => rematchMutation.mutate()} disabled={rematchMutation.isPending}>
            {rematchMutation.isPending ? "Creating..." : "Start a new game"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
