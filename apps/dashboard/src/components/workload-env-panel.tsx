import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@openbika/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { cn } from "@openbika/ui/lib/utils";
import { Eye, EyeOff } from "lucide-react";
import * as React from "react";

import { useProjectWorkspaceOutlet } from "#/components/project-workspace";
import {
  dashboardKeys,
  patchWorkloadEnvRequest,
} from "#/lib/dashboard-api-queries";
import {
  envFromWorkloadDesiredState,
  parseEnvText,
  serializeEnvText,
} from "#/lib/env-text";

const REDACTED = "••••";

interface WorkloadEnvPanelProps {
  workloadId: string;
}

export function WorkloadEnvironmentPanel({
  workloadId,
}: WorkloadEnvPanelProps) {
  const queryClient = useQueryClient();
  const { workloads, refreshWorkloads } = useProjectWorkspaceOutlet();
  const workload = workloads.find((w) => w.id === workloadId) ?? null;

  const [editing, setEditing] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [revealed, setRevealed] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const patchMut = useMutation({
    mutationFn: (env: Record<string, string>) =>
      patchWorkloadEnvRequest(workloadId, { env }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({
        queryKey: dashboardKeys.workloads(updated.projectId),
      });
      void refreshWorkloads();
    },
  });

  const desiredEnv = workload
    ? envFromWorkloadDesiredState(workload.desiredState)
    : {};

  React.useEffect(() => {
    setEditing(false);
    setEditText("");
    setErrorMessage(null);
  }, [workloadId]);

  async function handleSave() {
    if (!workload) return;

    let env: Record<string, string>;
    try {
      env = parseEnvText(editText);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not parse environment",
      );
      return;
    }

    setErrorMessage(null);

    try {
      await patchMut.mutateAsync(env);
      setEditing(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save environment",
      );
    }
  }

  function startEdit() {
    setEditing(true);
    setEditText(serializeEnvText(desiredEnv));
    setErrorMessage(null);
    patchMut.reset();
  }

  function cancelEdit() {
    setEditing(false);
    setErrorMessage(null);
    patchMut.reset();
  }

  if (!workload) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
          <CardDescription>Workload metadata is not available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sortedKeys = Object.keys(desiredEnv).sort((a, b) => a.localeCompare(b));
  const saving = patchMut.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Environment</CardTitle>
            <CardDescription>
              Edit environment variables passed to this workload (
              <code className="text-xs">KEY=value</code> per line). Saving
              persists changes and redeploys this workload.
            </CardDescription>
          </div>
          {!editing ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                aria-label={
                  revealed ? "Hide secret values" : "Show secret values"
                }
                disabled={sortedKeys.length === 0}
                onClick={() => setRevealed((v) => !v)}
                size="icon-sm"
                type="button"
                variant="outline"
              >
                {revealed ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
              <Button onClick={startEdit} type="button">
                Edit
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {editing ? (
          <>
            <textarea
              className={cn(
                "min-h-[168px] w-full rounded-md border border-border bg-background p-3 font-mono text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onChange={(event) => setEditText(event.target.value)}
              spellCheck={false}
              value={editText}
            />
            {errorMessage ? (
              <p className="text-destructive text-sm" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </>
        ) : sortedKeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No environment variables set. Choose Edit to add{" "}
            <code className="text-xs">KEY=value</code> lines.
          </p>
        ) : (
          <div className="max-h-[min(24rem,50dvh)] space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-sm">
            {sortedKeys.map((key) => (
              <p key={key} className="break-all">
                <span className="text-muted-foreground">{key}=</span>
                {revealed ? desiredEnv[key] : REDACTED}
              </p>
            ))}
          </div>
        )}
      </CardContent>
      {editing ? (
        <CardFooter className="justify-end gap-2">
          <Button
            disabled={saving}
            onClick={cancelEdit}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => void handleSave()}
            type="button"
          >
            {saving ? "Saving…" : "Save and redeploy"}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
