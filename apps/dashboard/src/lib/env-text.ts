import { pruneBlankWorkloadEnv } from "@openbika/contracts";

function isEnvRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  for (const v of Object.values(value)) {
    if (typeof v !== "string") {
      return false;
    }
  }
  return true;
}

/** Reads validated env mapping from workload desiredState.env. */
export function envFromWorkloadDesiredState(
  desiredState: Record<string, unknown>,
): Record<string, string> {
  if (!isEnvRecord(desiredState.env)) {
    return {};
  }
  return pruneBlankWorkloadEnv({ ...desiredState.env });
}

/**
 * Parses KEY=value lines (same semantics as workload create modal).
 */
export function parseEnvText(text: string): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) {
    return {};
  }

  const result: Record<string, string> = {};
  const lines = trimmed.split(/\r?\n/u);

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;

    const equalsIndex = stripped.indexOf("=");
    if (equalsIndex < 1) {
      throw new Error(`Invalid env line: ${stripped}`);
    }

    const key = stripped.slice(0, equalsIndex).trim();
    const valueTrimmed = stripped.slice(equalsIndex + 1).trim();
    if (!key) {
      throw new Error(`Invalid env key in: ${stripped}`);
    }
    if (valueTrimmed.length === 0) {
      delete result[key];
    } else {
      result[key] = valueTrimmed;
    }
  }

  return pruneBlankWorkloadEnv(result);
}

export function serializeEnvText(env: Record<string, string>): string {
  const cleaned = pruneBlankWorkloadEnv(env);
  return Object.keys(cleaned)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${cleaned[key] ?? ""}`)
    .join("\n");
}
