import { createRequire } from "node:module";
import pino, { type Logger } from "pino";

const nodeRequire = createRequire(import.meta.url);

export type { Logger };

export interface LoggerOptions {
  name: string;
  level?: string;
  pretty?: boolean;
}

export function createLogger({
  name,
  level = "info",
  pretty = false,
}: LoggerOptions): Logger {
  return pino({
    base: {
      service: name,
    },
    level,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "token",
        "*.password",
        "*.token",
      ],
      remove: true,
    },
    transport: pretty
      ? {
          target: nodeRequire.resolve("pino-pretty"),
          options: {
            colorize: true,
            singleLine: true,
          },
        }
      : undefined,
  });
}

export function createRequestId(): string {
  return crypto.randomUUID();
}
