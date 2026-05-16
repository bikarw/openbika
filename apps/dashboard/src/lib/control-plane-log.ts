import {
  controlPlaneActivityLogEntrySchema,
  type ControlPlaneActivityLogEntry,
} from "@openbika/contracts";

export function readControlPlaneActivityLog(
  observedState: Record<string, unknown> | undefined,
): ControlPlaneActivityLogEntry[] {
  const raw = observedState?.activityLog;
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: ControlPlaneActivityLogEntry[] = [];
  for (const entry of raw) {
    const parsed = controlPlaneActivityLogEntrySchema.safeParse(entry);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}
