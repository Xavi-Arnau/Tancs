import {
  getWeapon,
  turnHadAnyImpact,
  type GameDoc,
  type PlayerState,
  type Terrain,
  type TurnDoc,
} from "@tancs/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import TerrainCanvas, { type ActiveShot } from "@/game/TerrainCanvas";

interface Step {
  turn: TurnDoc;
  beforeTerrain: Terrain;
  afterTerrain: Terrain;
  afterPlayers: PlayerState[];
}

function reconstructSteps(game: GameDoc, turns: TurnDoc[]): Step[] {
  const initialHeights = game.terrain.heights.slice();
  // Undo in reverse chronological order — both across turns and, within each turn, across
  // its projectiles — since overlapping craters (multiple fragments landing near each
  // other) make `oldHeight`/`newHeight` assignment order-sensitive, unlike a simple sum.
  for (let i = turns.length - 1; i >= 0; i--) {
    const projectiles = turns[i].resolution.projectiles;
    for (let j = projectiles.length - 1; j >= 0; j--) {
      for (const d of projectiles[j].terrainDiff) {
        initialHeights[d.x] = d.oldHeight;
      }
    }
  }

  const initialHp: Record<string, number> = {};
  for (const p of game.players) initialHp[p.playerId] = p.hp;
  for (const turn of turns) {
    for (const projectile of turn.resolution.projectiles) {
      for (const d of projectile.damage) {
        initialHp[d.playerId] = (initialHp[d.playerId] ?? 0) + d.amount;
      }
    }
    for (const f of turn.resolution.tankFalls) {
      initialHp[f.playerId] = (initialHp[f.playerId] ?? 0) + f.fallDamage;
    }
  }

  let heights = initialHeights;
  let hp: Record<string, number> = { ...initialHp };

  return turns.map((turn) => {
    const beforeTerrain: Terrain = { width: game.terrain.width, heights: heights.slice() };

    const newHeights = heights.slice();
    const newHp = { ...hp };
    for (const projectile of turn.resolution.projectiles) {
      for (const d of projectile.terrainDiff) newHeights[d.x] = d.newHeight;
      for (const d of projectile.damage) newHp[d.playerId] = d.newHp;
    }
    for (const f of turn.resolution.tankFalls) {
      if (f.fallDamage > 0) {
        newHp[f.playerId] = Math.max(0, (newHp[f.playerId] ?? 0) - f.fallDamage);
      }
    }

    const afterTerrain: Terrain = { width: game.terrain.width, heights: newHeights };
    const afterPlayers = game.players.map((p) => ({ ...p, hp: newHp[p.playerId] }));

    heights = newHeights;
    hp = newHp;

    return { turn, beforeTerrain, afterTerrain, afterPlayers };
  });
}

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
    setActiveShot({
      preImpactTerrain: step.beforeTerrain,
      projectiles: step.turn.resolution.projectiles.map((p) => ({
        trajectory: p.trajectory,
        tickCount: p.tickCount,
        startTick: p.startTick,
        impact: p.impact,
        terrainDiff: p.terrainDiff,
      })),
      actingSlot: step.turn.actingSlot,
      angle: step.turn.action.angle,
      projectileStyle: getWeapon(step.turn.action.weaponId).projectileStyle,
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
        <TerrainCanvas terrain={last.afterTerrain} players={last.afterPlayers} />
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

      <TerrainCanvas terrain={step.afterTerrain} players={step.afterPlayers} activeShot={activeShot} />
    </div>
  );
}
