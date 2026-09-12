import { getWeapon, turnHadAnyImpact, type GameDoc, type TurnDoc } from "@tancs/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { reconstructSteps } from "@/game/reconstructSteps";
import { buildShotAnimation } from "@/game/shotAnimation";
import TerrainCanvas, { type ActiveShot } from "@/game/TerrainCanvas";

interface Props {
  game: GameDoc;
  turns: TurnDoc[];
  mySlot: 0 | 1;
  onDone: () => void;
}

export default function ReplayOverlay({ game, turns, mySlot, onDone }: Props) {
  // Computed once on mount from the props as first seen — background polling shouldn't
  // restart an in-progress replay animation.
  const [steps] = useState(() => reconstructSteps(game, turns));
  const [index, setIndex] = useState(0);
  const [activeShot, setActiveShot] = useState<ActiveShot | null>(null);
  const [continuing, setContinuing] = useState(false);

  const caughtUp = index >= steps.length;

  useEffect(() => {
    if (caughtUp) return;
    const step = steps[index];
    const weapon = getWeapon(step.turn.action.weaponId);
    const { projectiles, damagePopups, hazardZoneCreated, selfEffect, statusInflicted, captions, airstrikeFlight } = buildShotAnimation(
      game.players,
      weapon.name,
      step.turn.resolution,
      mySlot,
      false, // never previewed live — the viewer wasn't present for this turn
    );
    setActiveShot({
      preImpactTerrain: step.beforeTerrain,
      projectiles,
      actingSlot: step.turn.actingSlot,
      angle: step.turn.action.angle,
      projectileStyle: weapon.projectileStyle,
      projectileColor: weapon.projectileColor,
      damagePopups,
      captions,
      preImpactHazards: step.beforeHazards,
      hazardZoneCreated,
      preImpactPlayers: step.beforePlayers,
      selfEffect,
      statusInflicted,
      airstrikeFlight,
      onComplete: () => setIndex((i) => i + 1),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps, caughtUp]);

  if (caughtUp) {
    const last = steps[steps.length - 1];
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-8">
        <div>
          <h1 className="text-xl font-bold">Here's where things stand</h1>
          <p className="text-sm text-muted-foreground">
            {steps.length === 1 ? "1 turn" : `${steps.length} turns`} happened while you were away.
          </p>
        </div>
        <TerrainCanvas terrain={last.afterTerrain} players={last.afterPlayers} hazards={last.afterHazards} />
        <div className="flex justify-between text-sm">
          {last.afterPlayers.map((p) => (
            <span key={p.playerId}>
              {p.displayName ?? (p.slot === mySlot ? "You" : "Opponent")}: {Math.max(0, Math.round(p.hp))} HP
            </span>
          ))}
        </div>
        <Button
          disabled={continuing}
          onClick={() => {
            setContinuing(true);
            onDone();
          }}
        >
          {continuing ? "Continuing..." : "Continue"}
        </Button>
      </div>
    );
  }

  const step = steps[index];
  const weapon = getWeapon(step.turn.action.weaponId);
  const actingPlayer = game.players[step.turn.actingSlot];
  const actorLabel =
    actingPlayer.displayName ?? (step.turn.actingSlot === mySlot ? "You" : "Your opponent");
  const missed = !turnHadAnyImpact(step.turn.resolution);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Catching you up…</h1>
          <p className="text-sm text-muted-foreground">
            Turn {index + 1} of {steps.length}: {actorLabel} fired the {weapon.name}
            {missed ? " — it left the battlefield" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIndex(steps.length)}>
          Skip
        </Button>
      </div>

      <TerrainCanvas
        terrain={step.afterTerrain}
        players={step.afterPlayers}
        hazards={step.afterHazards}
        activeShot={activeShot}
      />
    </div>
  );
}
