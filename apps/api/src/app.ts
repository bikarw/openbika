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

export function createApi({ env }: CreateApiOptions) {
  const db = createDb(env.DATABASE_URL);
  const auth = createAuth({
    baseUrl: env.BETTER_AUTH_URL,
    db,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigin: env.WEB_ORIGIN,
  });
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

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
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
