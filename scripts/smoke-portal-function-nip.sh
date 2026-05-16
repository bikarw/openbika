#!/usr/bin/env bash
# Creates a portal user → org → project → Node bundle function, then curls the nip URL.
#
# Prereqs: Docker (+ Traefik `--profile edge` on :80), Postgres+Temporal compose, API (:8787),
# worker polling with (for THIS machine).
#
#     OPENBIKA_TRAEFIK_ROUTING=true
#     OPENBIKA_INGRESS_FREE_DNS_ZONE=nip.io
#     OPENBIKA_INGRESS_PUBLIC_IPV4=loopback   # resolves *.127.0.0.1.nip.io → localhost
#
# Plain `auto` uses your WAN IP — traffic then bypasses Docker Traefik on a dev laptop.
# Set OPENBIKA_INGRESS_PUBLIC_IPV4=loopback on worker+API (restart both), recreate workloads.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API="${OPENBIKA_API_URL:-http://localhost:8787}"
COOKIE="$(mktemp)"
FIXTURE="$ROOT/packages/provisioning/test/fixtures/node-http-fn"
TMPDIR_B="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_B"; rm -f "$COOKIE"' EXIT

if [[ ! -d "$FIXTURE" ]]; then
  echo "fixture missing: $FIXTURE" >&2
  exit 1
fi

( cd "$FIXTURE" && zip -qr "$TMPDIR_B/bundle.zip" index.mjs )
B64="$(base64 < "$TMPDIR_B/bundle.zip" | tr -d '\n')"
ARTIFACT_URI="data:application/zip;base64,${B64}"

MAIL="smoke-$(date +%s)-$RANDOM@example.invalid"
PASS="password123456789012"
NAME="Smoke User"

echo "→ POST $API/api/auth/sign-up/email ($MAIL)"
curl -sS -f -c "$COOKIE" -b "$COOKIE" -H "Content-Type: application/json" \
  -d "{\"email\":\"$MAIL\",\"password\":\"$PASS\",\"name\":\"$NAME\"}" \
  "$API/api/auth/sign-up/email" >/dev/null

OSLUG="smoke-$(date +%s)-$RANDOM"
echo "→ POST /v1/organizations slug=$OSLUG"
ORG_JSON="$(curl -sS -f -b "$COOKIE" -c "$COOKIE" -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Org\",\"slug\":\"${OSLUG}\"}" \
  "$API/v1/organizations")"

ORG_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["organization"]["id"])' <<<"$ORG_JSON")"
PSLUG="proj-$RANDOM"
echo "→ POST /v1/projects"
PROJ_JSON="$(curl -sS -f -b "$COOKIE" -H "Content-Type: application/json" \
  -d "{\"organizationId\":\"$ORG_ID\",\"name\":\"Smoke Project\",\"slug\":\"$PSLUG\"}" \
  "$API/v1/projects")"

PROJ_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["project"]["id"])' <<<"$PROJ_JSON")"

export ARTIFACT_URI
BODY="$(python3 -c 'import json,os; print(json.dumps({"kind":"function","name":"smoke-http-fn","runtime":"node","entrypoint":"index.mjs","source":{"type":"bundle","artifactUri":os.environ["ARTIFACT_URI"]}}))')"

echo "→ POST /v1/projects/$PROJ_ID/workloads (function bundle)"
WL_JSON="$(curl -sS -f -b "$COOKIE" -H "Content-Type: application/json" -d "$BODY" \
  "$API/v1/projects/$PROJ_ID/workloads")"
WL_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["workload"]["id"])' <<<"$WL_JSON")"

echo "→ Poll workload $WL_ID until ingress URL appears"
URL=""
for _ in $(seq 1 90); do
  W="$(curl -sS -f -b "$COOKIE" "$API/v1/workloads/$WL_ID")"
  URL="$(python3 -c '
import json,sys
w=json.load(sys.stdin)["workload"]
obs=w.get("observedState") or {}
routes=obs.get("ingressRoutes") or []
if routes and isinstance(routes,list) and routes[0].get("url"):
  print(routes[0]["url"])
elif isinstance(obs.get("publicBaseUrl"),str) and obs["publicBaseUrl"].strip():
  print(obs["publicBaseUrl"].strip())
' <<<"$W" || true)"
  ST="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["workload"]["status"])' <<<"$W")"
  if [[ -n "$URL" ]]; then
    echo "  status=$ST url=$URL"
    break
  fi
  echo "  … status=$ST"
  sleep 1
done

if [[ -z "$URL" ]]; then
  echo "Timed out waiting for ingress URL. Check worker env (nip.io + loopback) and Temporal." >&2
  exit 1
fi

if [[ "${SMOKE_ALLOW_WAN_NIP:-}" != "1" ]] && [[ "$URL" != *".127.0.0.1.nip.io"* ]] && [[ "$URL" != *".127.0.0.1.sslip.io"* ]] && [[ "$URL" != *"-127-0-0-1.sslip.io"* ]]; then
  echo "" >&2
  echo "Refusing to curl nip URL that embeds something other than 127.0.0.1 (likely OPENBIKA_INGRESS_PUBLIC_IPV4=auto)." >&2
  echo "  url=$URL" >&2
  echo "Restart API/worker with OPENBIKA_INGRESS_PUBLIC_IPV4=loopback (see .env.example), recreate the workload, rerun." >&2
  echo "Or: SMOKE_ALLOW_WAN_NIP=1 $0  (curl may hang if WAN does not route :80 here)" >&2
  exit 2
fi

echo "→ curl -fsS --connect-timeout 10 \"$URL\""
curl -fsS --connect-timeout 10 --max-time 30 "$URL"

echo ""
echo "OK — nip ingress reachable: $URL"
