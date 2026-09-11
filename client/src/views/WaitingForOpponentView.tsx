import type { GameDoc } from "@tancs/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WaitingForOpponentView({ game }: { game: GameDoc }) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}/join/${game.inviteToken}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — the link is still selectable/visible below.
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Waiting for an opponent</CardTitle>
          <CardDescription>Share this link with the friend you want to play against.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="break-all rounded-md border bg-muted px-3 py-2 font-mono text-xs">
            {inviteLink}
          </div>
          <Button onClick={copyLink}>{copied ? "Copied!" : "Copy invite link"}</Button>
          <p className="text-sm text-muted-foreground">
            This page will update automatically once they join.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
