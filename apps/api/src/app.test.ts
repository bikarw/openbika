import { describe, expect, it } from "vitest";

import {
  branchQueryResponseSchema,
  branchSchemaResponseSchema,
  createWorkloadRequestSchema,
  executeBranchQueryRequestSchema,
  patchWorkloadConfigRequestSchema,
  workloadStatusSchema,
} from "@openbika/contracts";

import { createApi } from "./app.js";

const testEnv = {
  API_HOST: "localhost",
  API_PORT: 8787,
  API_PUBLIC_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "test-secret-at-least-thirty-two-characters",
  BETTER_AUTH_URL: "http://localhost:8787",
  DATABASE_URL: "postgres://openbika:openbika@localhost:5432/openbika_control",
  ENABLE_PRETTY_LOGS: false,
  LOG_LEVEL: "silent",
  NODE_ENV: "test",
  TEMPORAL_ADDRESS: "localhost:7233",
  TEMPORAL_NAMESPACE: "default",
  TEMPORAL_TASK_QUEUE: "openbika-control-plane",
  WEB_ORIGIN: "http://localhost:3000",
} as const;

describe("api", () => {
  it("responds to health checks", async () => {
    const app = createApi({ env: testEnv });
    const response = await app.request("/health");

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "openbika-api",
    });
  });

  it("uses Openbika API naming in OpenAPI metadata", async () => {
    const app = createApi({ env: testEnv });
    const response = await app.request("/openapi.json");

    await expect(response.json()).resolves.toMatchObject({
      info: {
        title: "Openbika API",
      },
    });
  });

  it("rejects unauthenticated v1 routes", async () => {
    const app = createApi({ env: testEnv });
    const response = await app.request("/v1/organizations");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "request_error",
      message: "Authentication required",
    });
  });

  it("rejects unauthenticated branch studio routes", async () => {
    const app = createApi({ env: testEnv });
    const schemaResponse = await app.request("/v1/branches/br_test/schema");
    const queryResponse = await app.request("/v1/branches/br_test/query", {
      body: JSON.stringify({ readOnly: true, sql: "select 1" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    expect(schemaResponse.status).toBe(401);
    expect(queryResponse.status).toBe(401);
  });

  it("parses branch studio contract shapes", () => {
    expect(
      executeBranchQueryRequestSchema.parse({
        sql: "select 1",
      }),
    ).toMatchObject({
      readOnly: true,
      sql: "select 1",
    });

    expect(
      branchSchemaResponseSchema.parse({
        branchId: "br_test",
        tables: [
          {
            columns: [
              {
                dataType: "integer",
                defaultValue: null,
                isNullable: false,
                isPrimaryKey: true,
                name: "id",
                ordinalPosition: 1,
              },
            ],
            estimatedRows: 1,
            name: "users",
            schema: "public",
            type: "BASE TABLE",
          },
        ],
      }),
    ).toMatchObject({
      branchId: "br_test",
      tables: [{ name: "users", schema: "public" }],
    });

    expect(
      branchQueryResponseSchema.parse({
        columns: [{ dataTypeId: 23, name: "id" }],
        command: "SELECT",
        durationMs: 3,
        readOnly: true,
        rowCount: 1,
        rows: [{ id: 1 }],
        truncated: false,
      }),
    ).toMatchObject({
      command: "SELECT",
      rows: [{ id: 1 }],
    });
  });

  it("parses draft and configured workload contract shapes", () => {
    expect(createWorkloadRequestSchema.parse({ name: "api" })).toEqual({
      name: "api",
    });

    expect(workloadStatusSchema.parse("draft")).toBe("draft");

    expect(
      patchWorkloadConfigRequestSchema.parse({
        autoDeploy: false,
        build: {
          contextUri: ".",
          dockerfilePath: "Dockerfile",
          source: {
            gitProviderId: "git_provider_123",
            providerType: "github",
            ref: "main",
            repositoryFullName: "acme/api",
            repositoryUrl: "https://github.com/acme/api",
            type: "gitProvider",
          },
        },
        kind: "container",
        ports: [3000],
      }),
    ).toMatchObject({
      build: {
        source: {
          providerType: "github",
          repositoryFullName: "acme/api",
          type: "gitProvider",
        },
      },
      kind: "container",
      autoDeploy: false,
    });
  });
});
