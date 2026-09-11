import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getGameIdentity } from "@/identity/playerToken";
import { useGameState } from "@/hooks/useGameState";
import BattleView from "@/views/BattleView";
import BuyPhaseView from "@/views/BuyPhaseView";
import GameOverView from "@/views/GameOverView";
import ReplayOverlay from "@/views/ReplayOverlay";
import WaitingForOpponentView from "@/views/WaitingForOpponentView";

function CenteredMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function GameView() {
  const { gameId } = useParams<{ gameId: string }>();
  const identity = gameId ? getGameIdentity(gameId) : null;

  const { data, isLoading, error, markSeen } = useGameState(gameId, identity?.token);

  if (!identity) {
    return (
      <CenteredMessage
        title="No access to this game"
        message="This browser doesn't have a saved identity for this game. Use the link you originally created or joined with, on the device you used."
      />
    );
  }

  if (isLoading || !data) {
    return <CenteredMessage title="Loading..." message="Fetching game state." />;
  }

  if (error) {
    return <CenteredMessage title="Something went wrong" message={(error as Error).message} />;
  }

  const { game, newTurns, latestTurnNumber } = data;
  const mySlot = identity.slot;

  if (newTurns.length > 0) {
    return (
      <ReplayOverlay
        game={game}
        turns={newTurns}
        mySlot={mySlot}
        onDone={() => markSeen(latestTurnNumber)}
      />
    );
  }

  if (game.status === "waiting_for_player2") {
    return <WaitingForOpponentView game={game} />;
  }

  if (game.status === "buy_phase") {
    return <BuyPhaseView game={game} gameId={gameId!} token={identity.token} mySlot={mySlot} />;
  }

  if (game.status === "game_over") {
    return <GameOverView game={game} mySlot={mySlot} />;
  }

  return (
    <BattleView
      game={game}
      gameId={gameId!}
      token={identity.token}
      mySlot={mySlot}
      markSeen={markSeen}
    />
  );
}
