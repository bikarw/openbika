import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { cn } from "@openbika/ui/lib/utils";
import * as React from "react";

interface WorkloadRuntimeLogPanelProps {
  description?: string;
  errorMessage?: string | null;
  pending?: boolean;
  text: string;
  title: string;
  visible?: boolean;
}

export function WorkloadRuntimeLogPanel({
  description,
  errorMessage = null,
  pending = false,
  text,
  title,
  visible = true,
}: WorkloadRuntimeLogPanelProps) {
  const endAnchorRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [text]);

  if (!visible) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? (
          <CardDescription>{description}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2">
        {errorMessage ? (
          <p className="text-destructive text-sm" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div
          aria-live="polite"
          className={cn(
            "max-h-[min(32rem,60dvh)] space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-3",
            pending && text.length === 0 && "text-muted-foreground",
          )}
        >
          {text.length === 0 && !errorMessage ? (
            <p className="text-muted-foreground text-sm">
              {pending
                ? "Loading container output…"
                : "No container output captured yet."}
            </p>
          ) : (
            <pre className="m-0 break-words font-mono text-xs whitespace-pre-wrap">
              {text}
            </pre>
          )}
          <div ref={endAnchorRef} aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
