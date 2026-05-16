import type { ControlPlaneActivityLogEntry } from "@openbika/contracts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { cn } from "@openbika/ui/lib/utils";
import * as React from "react";

interface ControlPlaneLogPanelProps {
  description?: string;
  entries: ControlPlaneActivityLogEntry[];
  pending?: boolean;
  title: string;
}

export function ControlPlaneLogPanel({
  description,
  entries,
  pending = false,
  title,
}: ControlPlaneLogPanelProps) {
  const endAnchorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <div
          aria-live="polite"
          className={cn(
            "max-h-[min(32rem,60dvh)] space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-3",
            pending && entries.length === 0 && "text-muted-foreground",
          )}
        >
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {pending
                ? "Waiting for control-plane activity…"
                : "No log lines yet. Activity will appear here while this resource provisions or redeploys."}
            </p>
          ) : (
            entries.map((entry, index) => (
              <p key={`${entry.at}-${entry.message}-${String(index)}`} className="font-mono text-xs break-words whitespace-pre-wrap">
                <span className="text-muted-foreground">{entry.at}</span>{" "}
                {entry.message}
              </p>
            ))
          )}
          <div ref={endAnchorRef} aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
