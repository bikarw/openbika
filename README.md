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

## One-Time Server Install

On a fresh Ubuntu/Debian VPS, run the installer as root. It installs Docker,
Bun, clones `https://github.com/bikarw/openbika`, starts Postgres/Temporal/
Traefik, runs migrations, and registers the API and worker as systemd services.

```sh
curl -fsSL https://raw.githubusercontent.com/bikarw/openbika/main/scripts/install.sh | sudo bash
```

Useful production options:

```sh
curl -fsSL https://raw.githubusercontent.com/bikarw/openbika/main/scripts/install.sh | sudo bash -s -- \
  --api-public-url https://api.example.com \
  --web-origin https://app.example.com \
  --acme-email admin@example.com
```

After install:

```sh
systemctl status openbika-api openbika-worker
journalctl -u openbika-api -u openbika-worker -f
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

4. Start the stack (API + dashboard + Temporal worker):

```sh
turbo run dev --filter=@openbika/api --filter=@openbika/worker --filter=dashboard
```

(or `turbo run dev` to include every package that defines `dev`)

**URLs:** **`http://localhost:8787`** — control-plane API (+ Better Auth under `/api/auth/*`). **`http://localhost:3000`** — dashboard. Temporal UI defaults to **`http://localhost:8080`**. Logs may show **`0.0.0.0:8787`** (bind-all); browse **`localhost`**.

Older split-terminal style:

```sh
bun --filter @openbika/api dev
```

```sh
bun --filter @openbika/worker dev
```

**Free nip.io ingress on your laptop**: use `OPENBIKA_INGRESS_PUBLIC_IPV4=loopback`
(or `127.0.0.1`) together with Docker Traefik and `nip.io`. If you leave `auto`,
DNS points at your public WAN IP — traffic misses local Traefik, so workloads look “broken”.

End-to-end check (signup → Node bundle function → nip URL):

```sh
chmod +x scripts/smoke-portal-function-nip.sh
./scripts/smoke-portal-function-nip.sh
```

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
  -d '{"name":"app-db","plan":"developer","postgresVersion":"18"}' \
  http://localhost:8787/v1/projects/PROJECT_ID_FROM_PREVIOUS_RESPONSE/databases
```

After the worker processes the Temporal workflow, inspect the database:

```sh
curl -b /tmp/openbika.cookies \
  http://localhost:8787/v1/databases/DATABASE_ID_FROM_PREVIOUS_RESPONSE
```
