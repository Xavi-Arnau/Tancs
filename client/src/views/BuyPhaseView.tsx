import {
  listPurchasableWeapons,
  listTankClasses,
  type GameDoc,
  type WeaponDefinition,
} from "@tancs/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { buyWeapons } from "@/api/games";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { drawTankBody } from "@/game/tankVisuals";
import { getWeaponIcon } from "@/game/weaponIcons";

const TANK_PREVIEW_WIDTH = 48;
const TANK_PREVIEW_HEIGHT = 36;

function TankPreview({ tankClass, color }: { tankClass: string; color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // A low, mostly-horizontal barrel angle keeps the whole silhouette compact enough to fit
    // this small a canvas without clipping the barrel tip.
    drawTankBody(ctx, TANK_PREVIEW_WIDTH * 0.4, TANK_PREVIEW_HEIGHT - 4, tankClass, color, 20);
  }, [tankClass, color]);
  return (
    <canvas
      ref={canvasRef}
      width={TANK_PREVIEW_WIDTH}
      height={TANK_PREVIEW_HEIGHT}
      className="shrink-0"
    />
  );
}

const TANK_CLASSES = listTankClasses();

interface Props {
  game: GameDoc;
  gameId: string;
  token: string;
  mySlot: 0 | 1;
}

function WeaponIcon({ weapon }: { weapon: WeaponDefinition }) {
  const Icon = getWeaponIcon(weapon.icon);
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: `${weapon.color}20`, color: weapon.color }}
    >
      <Icon className="size-5" />
    </div>
  );
}

export default function BuyPhaseView({ game, gameId, token, mySlot }: Props) {
  const queryClient = useQueryClient();
  const me = game.players[mySlot];
  const weapons = listPurchasableWeapons();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [tankClassId, setTankClassId] = useState("standard");

  const totalCost = weapons.reduce(
    (sum, w) => sum + (quantities[w.id] ?? 0) * w.cost,
    0,
  );
  const remaining = me.currency - totalCost;

  const buyMutation = useMutation({
    mutationFn: () =>
      buyWeapons(
        gameId,
        token,
        Object.entries(quantities)
          .filter(([, qty]) => qty > 0)
          .map(([weaponId, quantity]) => ({ weaponId, quantity })),
        tankClassId,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gameState", gameId] });
    },
  });

  if (me.readyForBuyPhase) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
        <Card>
          <CardHeader>
            <CardTitle>Purchases locked in</CardTitle>
            <CardDescription>Waiting for the other player to finish buying.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  function setQty(weaponId: string, qty: number) {
    setQuantities((prev) => ({ ...prev, [weaponId]: Math.max(0, qty) }));
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-12">
      <div>
        <h1 className="text-2xl font-bold">Buy phase</h1>
        <p className="text-muted-foreground">
          Currency: {me.currency} &middot; Remaining after purchase: {remaining}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium text-muted-foreground">Tank</h2>
        <div className="flex flex-wrap gap-2">
          {TANK_CLASSES.map((tankClass) => (
            <Button
              key={tankClass.id}
              type="button"
              variant={tankClassId === tankClass.id ? "default" : "outline"}
              onClick={() => setTankClassId(tankClass.id)}
              className="h-24 w-24 flex-col gap-1 p-2"
            >
              <TankPreview tankClass={tankClass.id} color={tankClass.color} />
              <span className="text-xs font-medium leading-tight">{tankClass.name}</span>
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {TANK_CLASSES.find((t) => t.id === tankClassId)?.description}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {weapons.map((weapon) => {
          const canAffordOneMore = totalCost + weapon.cost <= me.currency;
          return (
            <Card key={weapon.id}>
              <CardHeader className="flex items-center gap-3">
                <WeaponIcon weapon={weapon} />
                <div>
                  <CardTitle className="text-base">{weapon.name}</CardTitle>
                  <CardDescription>{weapon.description}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {weapon.cost} currency each &middot; damage {weapon.damage}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setQty(weapon.id, (quantities[weapon.id] ?? 0) - 1)}
                  >
                    -
                  </Button>
                  <span className="w-6 text-center">{quantities[weapon.id] ?? 0}</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    disabled={!canAffordOneMore}
                    onClick={() => setQty(weapon.id, (quantities[weapon.id] ?? 0) + 1)}
                  >
                    +
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardFooter className="flex flex-col gap-2 pt-6">
          <Button
            className="w-full"
            disabled={remaining < 0 || buyMutation.isPending}
            onClick={() => buyMutation.mutate()}
          >
            {buyMutation.isPending ? "Confirming..." : "Confirm purchases"}
          </Button>
          {buyMutation.isError && (
            <p className="text-sm text-destructive">{buyMutation.error.message}</p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
