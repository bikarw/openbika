import { pruneBlankWorkloadEnv } from "@openbika/contracts";
import { parse as parseDotenv } from "dotenv";

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
 * Parses workload env text using the `dotenv` package parser.
 */
export function parseEnvText(text: string): Record<string, string> {
  return pruneBlankWorkloadEnv(parseDotenv(text));
}

function serializeEnvValue(value: string): string {
  if (!/[\s#"'`\\]/u.test(value)) {
    return value;
  }

  if (value.includes('"') && !value.includes("'")) {
    return `'${value}'`;
  }

  if (value.includes('"') && value.includes("'") && !value.includes("`")) {
    return `\`${value}\``;
  }

  return `"${value
    .replace(/\r/gu, "\\r")
    .replace(/\n/gu, "\\n")
    .replace(/\t/gu, "\\t")}"`;
}

export function serializeEnvText(env: Record<string, string>): string {
  const cleaned = pruneBlankWorkloadEnv(env);
  return Object.keys(cleaned)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${serializeEnvValue(cleaned[key] ?? "")}`)
    .join("\n");
}
