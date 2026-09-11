import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
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

function HomeBar() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← All games
      </Link>
    </div>
  );
}

export default function GameView() {
  const { gameId } = useParams<{ gameId: string }>();
  const identity = gameId ? getGameIdentity(gameId) : null;

  const { data, isLoading, error, markSeen } = useGameState(gameId, identity?.token);
  // While the acting player's own shot is still animating in BattleView, hold off switching to
  // GameOverView or ReplayOverlay even once the (quickly-refetched) data says otherwise —
  // otherwise a later screen preempts the shot before its impact is even shown. This matters
  // most against a CPU opponent: its reply turn is resolved synchronously, in the same request
  // as the player's own shot, so it can already be sitting in the DB (and get polled as an
  // "unseen" turn) before the player's own animation has even finished.
  const [battleAnimating, setBattleAnimating] = useState(false);

  let content: ReactNode;

  if (!identity) {
    content = (
      <CenteredMessage
        title="No access to this game"
        message="This browser doesn't have a saved identity for this game. Use the link you originally created or joined with, on the device you used."
      />
    );
  } else if (isLoading || !data) {
    content = <CenteredMessage title="Loading..." message="Fetching game state." />;
  } else if (error) {
    content = <CenteredMessage title="Something went wrong" message={(error as Error).message} />;
  } else {
    const { game, newTurns, latestTurnNumber } = data;
    const mySlot = identity.slot;

    if (newTurns.length > 0 && !battleAnimating) {
      content = (
        <ReplayOverlay
          game={game}
          turns={newTurns}
          mySlot={mySlot}
          onDone={() => markSeen(latestTurnNumber)}
        />
      );
    } else if (game.status === "waiting_for_player2") {
      content = <WaitingForOpponentView game={game} />;
    } else if (game.status === "buy_phase") {
      content = <BuyPhaseView game={game} gameId={gameId!} token={identity.token} mySlot={mySlot} />;
    } else if (game.status === "game_over" && !battleAnimating) {
      content = <GameOverView game={game} mySlot={mySlot} />;
    } else {
      content = (
        <BattleView
          game={game}
          gameId={gameId!}
          token={identity.token}
          mySlot={mySlot}
          markSeen={markSeen}
          onAnimatingChange={setBattleAnimating}
        />
      );
    }
  }

  return (
    <>
      <HomeBar />
      {content}
    </>
  );
}
