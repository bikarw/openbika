import { createAuth } from "@openbika/auth";
import { createDb } from "@openbika/db";
import type { ApiEnv } from "@openbika/env";
import { createLogger, createRequestId } from "@openbika/observability";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import type { ApiBindings } from "./context.js";
import { createV1Routes } from "./routes/v1.js";

export interface CreateApiOptions {
  env: ApiEnv;
}

function normalizedOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function requestHost(headers: Headers): string | null {
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

function requestOrigin(headers: Headers): string | null {
  const origin = normalizedOrigin(headers.get("origin"));
  if (!origin) return null;

  const host = requestHost(headers);
  if (!host) return null;

  try {
    return new URL(origin).host === host ? origin : null;
  } catch {
    return null;
  }
}

function authForRequest({
  db,
  env,
  headers,
}: {
  db: ReturnType<typeof createDb>;
  env: ApiEnv;
  headers: Headers;
}) {
  const trustedOrigins = new Set<string>();
  for (const origin of [
    normalizedOrigin(env.WEB_ORIGIN),
    normalizedOrigin(env.API_PUBLIC_URL),
    normalizedOrigin(env.BETTER_AUTH_URL),
    requestOrigin(headers),
  ]) {
    if (origin) {
      trustedOrigins.add(origin);
    }
  }

  return createAuth({
    baseUrl: env.BETTER_AUTH_URL,
    db,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [...trustedOrigins],
  });
}

export function createApi({ env }: CreateApiOptions) {
  const db = createDb(env.DATABASE_URL);
  const logger = createLogger({
    level: env.LOG_LEVEL,
    name: "openbika-api",
    pretty: env.ENABLE_PRETTY_LOGS,
  });

  const app = new Hono<ApiBindings>();

  app.use(
    "*",
    cors({
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      origin: env.WEB_ORIGIN,
    }),
  );

  app.use("*", async (c, next) => {
    const auth = authForRequest({
      db,
      env,
      headers: c.req.raw.headers,
    });

    c.set("auth", auth);
    c.set("db", db);
    c.set("logger", logger);
    c.set("requestId", createRequestId());

    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    c.set("session", session?.session ?? null);
    c.set("user", session?.user ?? null);

    await next();
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => {
    const auth = authForRequest({
      db,
      env,
      headers: c.req.raw.headers,
    });
    return auth.handler(c.req.raw);
  });
  app.route("/v1", createV1Routes({ env }));

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "openbika-api",
      version: "0.0.0",
    }),
  );

  app.get("/v1/me", (c) => {
    const user = c.get("user");

    if (!user) {
      throw new HTTPException(401, {
        message: "Authentication required",
      });
    }

    return c.json({
      user: {
        email: user.email,
        id: user.id,
        name: user.name,
      },
    });
  });

  app.get("/openapi.json", (c) =>
    c.json({
      info: {
        title: "Openbika API",
        version: "0.0.0",
      },
      openapi: "3.1.0",
      paths: {
        "/health": {
          get: {
            responses: {
              "200": {
                description: "API health status",
              },
            },
            tags: ["System"],
          },
        },
        "/v1/me": {
          get: {
            responses: {
              "200": {
                description: "Current authenticated portal user",
              },
              "401": {
                description: "Missing or invalid session",
              },
            },
            tags: ["Identity"],
          },
        },
      },
    }),
  );

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    const routeLogger = c.get("logger");

    routeLogger.error({ error, requestId }, "Unhandled API error");

    if (error instanceof HTTPException) {
      return c.json(
        {
          error: error.status >= 500 ? "api_error" : "request_error",
          message: error.message,
          requestId,
        },
        error.status,
      );
    }

    return c.json(
      {
        error: "internal_server_error",
        requestId,
      },
      500,
    );
  });

  return app;
}

export type ApiApp = ReturnType<typeof createApi>;
