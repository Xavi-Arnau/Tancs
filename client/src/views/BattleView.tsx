import {
  getWeapon,
  MAX_ANGLE,
  MAX_POWER,
  MIN_ANGLE,
  MIN_POWER,
  resolveTurnStartTick,
  WEAPONS,
  type GameDoc,
} from "@tancs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { submitTurn } from "@/api/games";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { isMuted, setMuted } from "@/game/sfx";
import { buildShotAnimation, buildTickAnimation } from "@/game/shotAnimation";
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
  const [muted, setMutedState] = useState(() => isMuted());

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

  // Tracks the game.version we last previewed the start-of-turn tick for, so a background poll
  // (or any other re-render while it's still my turn) doesn't replay the same preview twice.
  // Resets naturally on remount — e.g. after ReplayOverlay hands control back for a new turn.
  const previewedVersionRef = useRef<number | null>(null);

  // A frozen tank is forced to keep firing at its last angle — the server enforces this
  // authoritatively regardless of what we submit, but reflect it in the UI too so it's not
  // confusing, and submit that same angle so our own optimistic state matches.
  const isFrozen = isMyTurn && (me.frozen?.turnsRemaining ?? 0) > 0;
  const effectiveAngle = isFrozen ? me.lastAngle : angle;
  const selectedWeapon = getWeapon(weaponId);
  const isInstantWeapon = selectedWeapon.projectile === "instant";
  // Airstrike is unaimed too (angle/power are ignored server-side), but unlike instant weapons
  // it still takes time to resolve, so it keeps the "Fire"/"Firing..." button label — only the
  // aim controls (sliders + aim reticle) are hidden.
  const needsAimControls = selectedWeapon.projectile !== "instant" && selectedWeapon.projectile !== "airstrike";

  const fireMutation = useMutation({
    mutationFn: () => submitTurn(gameId, token, weaponId, effectiveAngle, power),
    // Captured synchronously at click-time — immune to the background poll (useGameState's
    // 5s refetch) racing ahead and updating `game` before onSuccess below gets to run. If we
    // read `game.terrain`/`game.hazards`/`game.players` inside onSuccess instead, a poll that
    // happens to land in that async gap could hand us the POST-impact state as our "pre-impact"
    // snapshot, revealing this shot's new hazard zone before it visually lands.
    onMutate: () => ({
      preImpactTerrain: game.terrain,
      preImpactHazards: game.hazards,
      preImpactPlayers: game.players,
    }),
    onSuccess: (res, _vars, context) => {
      // Mark this turn seen immediately — before it's persisted, the background poll
      // (or our own refetch below) would otherwise "discover" it as unseen and hand it
      // to ReplayOverlay, playing the same shot we're about to animate a second time.
      markSeen(res.turn.turnNumber);
      saveLastShot(gameId, { weaponId, angle: effectiveAngle, power });
      onAnimatingChange(true);
      // tickAlreadyShown: true — this turn's start-of-turn tick was already previewed live
      // (see the effect below) before the player could even pick a weapon, so it isn't
      // re-animated here; only the shot's own impact plays now.
      const { projectiles, damagePopups, hazardZoneCreated, selfEffect, statusInflicted, captions, soundCues, airstrikeFlight } =
        buildShotAnimation(game.players, getWeapon(weaponId), res.turn.resolution, mySlot, true);
      setActiveShot({
        preImpactTerrain: context.preImpactTerrain,
        projectiles,
        actingSlot: mySlot,
        // Use the server-authoritative angle it actually echoes back (matters whenever a
        // frozen tank's requested angle gets overridden), not local state.
        angle: res.turn.action.angle,
        projectileStyle: getWeapon(weaponId).projectileStyle,
        projectileColor: getWeapon(weaponId).projectileColor,
        damagePopups,
        captions,
        preImpactHazards: context.preImpactHazards,
        hazardZoneCreated,
        preImpactPlayers: context.preImpactPlayers,
        selfEffect,
        statusInflicted,
        soundCues,
        airstrikeFlight,
        onComplete: async () => {
          // Wait for the refetch to actually land before releasing the animating lock — if we
          // cleared activeShot first, the Fire button's disabled check would briefly fall back
          // to the stale pre-shot `game` prop (still showing it as our turn) until this refetch
          // resolves, flashing the button enabled for a moment before the screen catches up
          // (most visible vs CPU, where that "catch up" is a jump straight to ReplayOverlay).
          await queryClient.invalidateQueries({ queryKey: ["gameState", gameId] });
          setActiveShot(null);
          onAnimatingChange(false);
        },
      });
    },
  });

  // The moment it's my turn and nothing else is animating, preview this turn's start-of-turn
  // tick (hazard/burn damage, terrain sinking, status decay/expiry, corrosion) BEFORE the player
  // picks a weapon — resolveTurnStartTick is pure and depends only on terrain/players/hazards,
  // never on what's about to be fired, and nothing else can mutate game state while it's my
  // turn, so this preview is guaranteed to match what the server actually does once I fire.
  useEffect(() => {
    if (!isMyTurn || activeShot || fireMutation.isPending) return;
    if (previewedVersionRef.current === game.version) return;
    previewedVersionRef.current = game.version;

    const tick = resolveTurnStartTick({
      terrain: game.terrain,
      players: game.players,
      hazards: game.hazards,
      actingSlot: mySlot,
    });
    const hasVisibleEffect =
      tick.hazardDamage.length > 0 ||
      tick.burnDamage.length > 0 ||
      tick.hazardTerrainDiff.length > 0 ||
      tick.statusInflicted.length > 0 ||
      tick.statusExpired.length > 0;
    if (!hasVisibleEffect) return;

    const { damagePopups, statusInflicted, captions, soundCues } = buildTickAnimation(game.players, tick, mySlot);
    setActiveShot({
      preImpactTerrain: tick.terrain,
      projectiles: [],
      actingSlot: mySlot,
      angle: me.lastAngle,
      isTickOnly: true,
      damagePopups,
      captions,
      preImpactHazards: tick.hazards,
      preImpactPlayers: tick.players,
      statusInflicted,
      soundCues,
      onComplete: () => setActiveShot(null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, game.version, activeShot, fireMutation.isPending]);

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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setMutedState(next);
            }}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Badge variant={isMyTurn ? "default" : "secondary"}>
            {isMyTurn ? "Your turn" : "Opponent's turn"}
          </Badge>
        </div>
      </div>

      <TerrainCanvas
        terrain={game.terrain}
        players={game.players}
        hazards={game.hazards}
        aim={isMyTurn && !activeShot && needsAimControls ? { slot: mySlot, angle: effectiveAngle } : null}
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

          {needsAimControls && (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Angle</span>
                  <span>{effectiveAngle}°</span>
                </div>
                <Slider
                  value={[effectiveAngle]}
                  min={MIN_ANGLE}
                  max={MAX_ANGLE}
                  step={1}
                  disabled={!isMyTurn || isFrozen}
                  onValueChange={([v]) => setAngle(v)}
                />
                {isFrozen && (
                  <p className="text-xs text-sky-600">
                    Frozen — angle locked to your last shot ({me.frozen!.turnsRemaining} turn
                    {me.frozen!.turnsRemaining === 1 ? "" : "s"} left)
                  </p>
                )}
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
            </>
          )}

          <Button
            disabled={!isMyTurn || fireMutation.isPending || Boolean(activeShot)}
            onClick={() => fireMutation.mutate()}
          >
            {fireMutation.isPending
              ? isInstantWeapon
                ? "Using..."
                : "Firing..."
              : isInstantWeapon
                ? "Use"
                : "Fire"}
          </Button>
          {fireMutation.isError && (
            <p className="text-sm text-destructive">{fireMutation.error.message}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
