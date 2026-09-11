import { getWeapon, MAX_ANGLE, MAX_POWER, MIN_ANGLE, MIN_POWER, WEAPONS, type GameDoc } from "@tancs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { submitTurn } from "@/api/games";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { buildShotAnimation } from "@/game/shotAnimation";
import TerrainCanvas, { type ActiveShot } from "@/game/TerrainCanvas";
import { getWeaponIcon } from "@/game/weaponIcons";
import { getLastShot, saveLastShot } from "@/identity/lastShotSettings";

interface Props {
  game: GameDoc;
  gameId: string;
  token: string;
  mySlot: 0 | 1;
  markSeen: (turnNumber: number) => void;
  onAnimatingChange: (animating: boolean) => void;
}

export default function BattleView({ game, gameId, token, mySlot, markSeen, onAnimatingChange }: Props) {
  const queryClient = useQueryClient();
  const me = game.players[mySlot];
  const opponent = game.players[mySlot === 0 ? 1 : 0];
  const isMyTurn = game.status === "battle_phase" && game.currentTurnPlayerIndex === mySlot;

  const availableWeapons = Object.values(WEAPONS).filter((w) => {
    if (w.defaultAmmo === "infinite") return true;
    const entry = me.inventory.find((i) => i.weaponId === w.id);
    return (entry?.quantity ?? 0) > 0;
  });

  const [weaponId, setWeaponId] = useState(() => {
    const stored = getLastShot(gameId);
    if (stored && availableWeapons.some((w) => w.id === stored.weaponId)) return stored.weaponId;
    return availableWeapons[0]?.id ?? "basic_shell";
  });
  const [angle, setAngle] = useState(() => getLastShot(gameId)?.angle ?? 45);
  const [power, setPower] = useState(() => getLastShot(gameId)?.power ?? 50);
  const [activeShot, setActiveShot] = useState<ActiveShot | null>(null);

  const fireMutation = useMutation({
    mutationFn: () => submitTurn(gameId, token, weaponId, angle, power),
    onSuccess: (res) => {
      // Mark this turn seen immediately — before it's persisted, the background poll
      // (or our own refetch below) would otherwise "discover" it as unseen and hand it
      // to ReplayOverlay, playing the same shot we're about to animate a second time.
      markSeen(res.turn.turnNumber);
      saveLastShot(gameId, { weaponId, angle, power });
      onAnimatingChange(true);
      const { projectiles, damagePopups } = buildShotAnimation(game.players, res.turn.resolution);
      setActiveShot({
        preImpactTerrain: game.terrain,
        projectiles,
        actingSlot: mySlot,
        angle,
        projectileStyle: getWeapon(weaponId).projectileStyle,
        damagePopups,
        onComplete: () => {
          setActiveShot(null);
          onAnimatingChange(false);
          queryClient.invalidateQueries({ queryKey: ["gameState", gameId] });
        },
      });
    },
  });

  function ammoLabel(id: string): string | number {
    const w = getWeapon(id);
    if (w.defaultAmmo === "infinite") return "∞";
    return me.inventory.find((i) => i.weaponId === id)?.quantity ?? 0;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Battle</h1>
          <p className="text-sm text-muted-foreground">Wind: {game.wind > 0 ? "→" : game.wind < 0 ? "←" : "—"} {Math.abs(game.wind)}</p>
        </div>
        <Badge variant={isMyTurn ? "default" : "secondary"}>
          {isMyTurn ? "Your turn" : "Opponent's turn"}
        </Badge>
      </div>

      <TerrainCanvas
        terrain={game.terrain}
        players={game.players}
        hazards={game.hazards}
        aim={isMyTurn && !activeShot ? { slot: mySlot, angle } : null}
        activeShot={activeShot}
      />

      <div className="flex justify-between text-sm">
        <span>{me.displayName ?? "You"}: {me.hp} HP</span>
        <span>{opponent.displayName ?? "Opponent"}: {opponent.hp} HP</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fire</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {availableWeapons.map((w) => {
              const Icon = getWeaponIcon(w.icon);
              return (
                <Button
                  key={w.id}
                  variant={weaponId === w.id ? "default" : "outline"}
                  disabled={!isMyTurn}
                  onClick={() => setWeaponId(w.id)}
                  className="h-24 w-24 flex-col gap-1 p-2"
                >
                  <Icon className="size-9" style={{ color: w.color }} />
                  <span className="text-xs font-medium leading-tight">{w.name}</span>
                  <span className="text-[10px] leading-tight opacity-75">{ammoLabel(w.id)}</span>
                </Button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Angle</span>
              <span>{angle}°</span>
            </div>
            <Slider
              value={[angle]}
              min={MIN_ANGLE}
              max={MAX_ANGLE}
              step={1}
              disabled={!isMyTurn}
              onValueChange={([v]) => setAngle(v)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Power</span>
              <span>{power}</span>
            </div>
            <Slider
              value={[power]}
              min={MIN_POWER}
              max={MAX_POWER}
              step={1}
              disabled={!isMyTurn}
              onValueChange={([v]) => setPower(v)}
            />
          </div>

          <Button
            disabled={!isMyTurn || fireMutation.isPending || Boolean(activeShot)}
            onClick={() => fireMutation.mutate()}
          >
            {fireMutation.isPending ? "Firing..." : "Fire"}
          </Button>
          {fireMutation.isError && (
            <p className="text-sm text-destructive">{fireMutation.error.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
