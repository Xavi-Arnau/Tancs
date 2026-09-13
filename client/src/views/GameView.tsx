import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { resolveCpuTurn } from "@/api/games";
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

  const { data, isLoading, error, markSeen, refetch } = useGameState(gameId, identity?.token);
  // While the acting player's own shot is still animating in BattleView, hold off switching to
  // GameOverView or ReplayOverlay even once the (quickly-refetched) data says otherwise —
  // otherwise a later screen preempts the shot before its impact is even shown. Independent of
  // the CPU (see the effect below): this also matters for the player's own turn — e.g. a
  // game-ending shot's outcome can be polled in before its own impact has visually landed.
  const [battleAnimating, setBattleAnimating] = useState(false);

  // The CPU is treated like a real second player: it takes its own turn, as its own write (see
  // resolve-cpu-turn.mts), rather than having its reply chained into the human's own submit-turn
  // request. So whenever it's genuinely the CPU's turn and nothing has happened yet, this client
  // (whichever one happens to be open — including a fresh reload) is the one that nudges it to
  // play, the same way a live second player would simply act on their own turn. Guarded by a ref
  // keyed on `game.version` so it fires once per version rather than on every 5s poll while
  // waiting for the call to land.
  const triggeredCpuVersionRef = useRef<number | null>(null);
  const game = data?.game;
  const newTurns = data?.newTurns ?? [];
  useEffect(() => {
    if (!gameId || !identity || !game) return;
    if (game.mode !== "vs_cpu" || game.status !== "battle_phase") return;
    if (game.currentTurnPlayerIndex === identity.slot) return; // it's the human's turn
    if (newTurns.length > 0) return; // the CPU's reply is already here, just not seen yet
    if (triggeredCpuVersionRef.current === game.version) return;
    triggeredCpuVersionRef.current = game.version;

    resolveCpuTurn(gameId, identity.token)
      .then(() => refetch())
      .catch(() => {
        // Transient failure — allow a retry on the next render of this same version (e.g. the
        // next background poll) instead of getting stuck having "used up" this version's attempt.
        if (triggeredCpuVersionRef.current === game.version) triggeredCpuVersionRef.current = null;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, identity, game?.version, game?.mode, game?.status, game?.currentTurnPlayerIndex, newTurns.length]);

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
