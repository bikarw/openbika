# Openbika

Openbika is a Rwanda-first managed Postgres platform. The backend foundation
is a TypeScript control plane with a standard Postgres data plane, better-auth
for portal identity, Drizzle for metadata, and Temporal for long-running
operational workflows.

## Workspace

Deployable applications live in `apps/*` and reusable platform code lives in
`packages/*`.

- `apps/api`: Hono API, Better Auth routes, health checks, and OpenAPI output.
- `apps/worker`: Temporal worker for provisioning, backups, restores, and
  maintenance workflows.
- `packages/db`: control-plane metadata schema, migrations, and Drizzle client.
- `packages/contracts`: Zod/OpenAPI schemas shared by API, worker, SDK, and CLI.
- `packages/provisioning`: data-plane provider abstraction for local, Strettch,
  and AOS implementations.

Customer database payload data belongs in the Rwanda data plane. The control
plane stores metadata, auth, audit events, operational state, and coarse usage
only.

## Commands

```sh
bun install
bun run check-types
bun run lint
bun run build
```

## Local API Setup On This Mac

1. Install dependencies and create your local environment file.

```sh
bun install
cp .env.example .env
```

2. Start the local control-plane Postgres and Temporal services.

```sh
docker compose -f infra/docker/docker-compose.yml up -d
```

3. Generate and apply the Drizzle metadata database migrations.

```sh
bun run db:generate
bun run db:migrate
```

4. Start the API and worker in separate terminals.

```sh
bun --filter @openbika/api dev
```

```sh
bun --filter @openbika/worker dev
```

The API listens on `http://localhost:8787`. Temporal UI is available at
`http://localhost:8080`.

## Local API Smoke Test

Check the API health endpoint:

```sh
curl http://localhost:8787/health
```

Create a local portal user and store the auth cookie:

```sh
curl -i -c /tmp/openbika.cookies \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123456","name":"Dev User"}' \
  http://localhost:8787/api/auth/sign-up/email
```

List regions. The local dev region is `region_local_rw1`.

```sh
curl -b /tmp/openbika.cookies http://localhost:8787/v1/regions
```

Create an organization, project, and managed Postgres database:

```sh
curl -b /tmp/openbika.cookies \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo Org","slug":"demo-org"}' \
  http://localhost:8787/v1/organizations
```

```sh
curl -b /tmp/openbika.cookies \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"ORG_ID_FROM_PREVIOUS_RESPONSE","name":"Demo Project","slug":"demo-project"}' \
  http://localhost:8787/v1/projects
```

```sh
curl -b /tmp/openbika.cookies \
  -H "Content-Type: application/json" \
  -d '{"name":"app-db","regionId":"region_local_rw1","plan":"developer","postgresVersion":"18"}' \
  http://localhost:8787/v1/projects/PROJECT_ID_FROM_PREVIOUS_RESPONSE/databases
```

After the worker processes the Temporal workflow, inspect the database:

```sh
curl -b /tmp/openbika.cookies \
  http://localhost:8787/v1/databases/DATABASE_ID_FROM_PREVIOUS_RESPONSE
```
