#!/usr/bin/env bash
# One-time Openbika server installer for Ubuntu/Debian VPS hosts.

set -euo pipefail

REPO_URL="${OPENBIKA_REPO_URL:-https://github.com/bikarw/openbika.git}"
BRANCH="${OPENBIKA_BRANCH:-main}"
INSTALL_DIR="${OPENBIKA_INSTALL_DIR:-/opt/openbika}"
SERVICE_USER="${OPENBIKA_SERVICE_USER:-openbika}"
BUN_VERSION="${OPENBIKA_BUN_VERSION:-1.3.13}"
API_PORT="${OPENBIKA_API_PORT:-8787}"
API_PUBLIC_URL="${OPENBIKA_API_PUBLIC_URL:-}"
DASHBOARD_PORT="${OPENBIKA_DASHBOARD_PORT:-3000}"
DASHBOARD_PUBLIC_URL="${OPENBIKA_DASHBOARD_PUBLIC_URL:-}"
WEB_ORIGIN="${OPENBIKA_WEB_ORIGIN:-}"
ACME_EMAIL="${OPENBIKA_TRAEFIK_ACME_EMAIL:-admin@example.com}"
ENABLE_EDGE="true"

usage() {
  cat <<EOF
Usage: sudo bash scripts/install.sh [options]

Options:
  --repo-url URL        Git repository URL (default: $REPO_URL)
  --branch NAME         Git branch/tag to install (default: $BRANCH)
  --install-dir PATH    Install directory (default: $INSTALL_DIR)
  --api-public-url URL      Public API URL (default: http://<server-ip>:$API_PORT)
  --dashboard-port PORT     Dashboard HTTP port (default: $DASHBOARD_PORT)
  --dashboard-public-url URL
                            Public dashboard URL (default: http://<server-ip>:<dashboard-port>)
  --web-origin URL          Browser origin allowed by CORS/auth (default: dashboard URL)
  --acme-email EMAIL        Let's Encrypt email for Traefik (default: $ACME_EMAIL)
  --no-edge             Do not start Traefik or enable workload public ingress
  -h, --help            Show this help

Environment variables with the OPENBIKA_* names shown in the script can also
be used instead of flags.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url)
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --api-public-url)
      API_PUBLIC_URL="$2"
      shift 2
      ;;
    --dashboard-port)
      DASHBOARD_PORT="$2"
      shift 2
      ;;
    --dashboard-public-url)
      DASHBOARD_PUBLIC_URL="$2"
      shift 2
      ;;
    --web-origin)
      WEB_ORIGIN="$2"
      shift 2
      ;;
    --acme-email)
      ACME_EMAIL="$2"
      shift 2
      ;;
    --no-edge)
      ENABLE_EDGE="false"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

log() {
  printf '\n==> %s\n' "$*"
}

need_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    echo "Run this installer as root, for example: sudo bash $0" >&2
    exit 1
  fi
}

require_debian_like() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "This installer currently supports Ubuntu/Debian hosts with apt-get." >&2
    exit 1
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "This installer needs systemd/systemctl." >&2
    exit 1
  fi
}

public_ipv4() {
  local ip
  ip="$(curl -fsS --max-time 5 https://api4.ipify.org || true)"
  if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    printf '%s' "$ip"
    return
  fi
  hostname -I | awk '{print $1}'
}

run_as_service_user() {
  runuser -u "$SERVICE_USER" -- env HOME="/var/lib/$SERVICE_USER" "$@"
}

run_in_install_dir() {
  local dir
  dir="$(printf "%q" "$INSTALL_DIR")"
  run_as_service_user bash -lc "cd $dir && $*"
}

restore_tracked_typescript_build_metadata() {
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    return
  fi

  log "Restoring tracked TypeScript build metadata"
  run_in_install_dir "git ls-files -z -- ':(glob)**/tsconfig.tsbuildinfo' | xargs -0r git checkout --"
}

remove_typescript_build_metadata() {
  if [[ ! -d "$INSTALL_DIR/.git" ]]; then
    return
  fi

  log "Removing generated TypeScript build metadata"
  run_in_install_dir "find . -name tsconfig.tsbuildinfo -type f -delete"
}

install_packages() {
  log "Installing system packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates \
    curl \
    git \
    openssl \
    unzip \
    xz-utils

  if ! command -v docker >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
  fi

  if ! docker compose version >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin \
      || DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2 \
      || {
        echo "Could not install Docker Compose v2. Install the Docker compose plugin and re-run." >&2
        exit 1
      }
  fi
}

install_bun() {
  if [[ -x /usr/local/bin/bun ]] && /usr/local/bin/bun --version | grep -qx "$BUN_VERSION"; then
    return
  fi

  log "Installing Bun $BUN_VERSION"
  install -d -m 0755 /opt/bun
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/opt/bun bash -s "bun-v$BUN_VERSION"
  ln -sf /opt/bun/bin/bun /usr/local/bin/bun
  chmod -R a+rX /opt/bun
}

ensure_service_user() {
  log "Preparing service user"
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --create-home --home-dir "/var/lib/$SERVICE_USER" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
  usermod -aG docker "$SERVICE_USER"
  install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "/var/lib/$SERVICE_USER"
}

checkout_repo() {
  log "Checking out $REPO_URL#$BRANCH"
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    restore_tracked_typescript_build_metadata
    run_as_service_user git -C "$INSTALL_DIR" fetch --prune origin
    run_as_service_user git -C "$INSTALL_DIR" checkout "$BRANCH"
    run_as_service_user git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH"
    remove_typescript_build_metadata
    return
  fi

  if [[ -e "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null || true)" ]]; then
    echo "$INSTALL_DIR exists but is not an empty git checkout." >&2
    exit 1
  fi

  install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$INSTALL_DIR"
  run_as_service_user git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
}

write_env_files() {
  log "Writing environment files"
  local detected_ip
  detected_ip="$(public_ipv4)"

  if [[ -z "$API_PUBLIC_URL" ]]; then
    API_PUBLIC_URL="http://$detected_ip:$API_PORT"
  fi
  if [[ -z "$DASHBOARD_PUBLIC_URL" ]]; then
    DASHBOARD_PUBLIC_URL="http://$detected_ip:$DASHBOARD_PORT"
  fi
  if [[ -z "$WEB_ORIGIN" ]]; then
    WEB_ORIGIN="$DASHBOARD_PUBLIC_URL"
  fi

  local auth_secret
  if [[ -f "$INSTALL_DIR/.env" ]] && grep -q '^BETTER_AUTH_SECRET=' "$INSTALL_DIR/.env"; then
    auth_secret="$(grep '^BETTER_AUTH_SECRET=' "$INSTALL_DIR/.env" | tail -n 1 | cut -d= -f2-)"
  else
    auth_secret="$(openssl rand -base64 48 | tr -d '\n')"
  fi

  cat >"$INSTALL_DIR/.env" <<EOF
NODE_ENV=production
LOG_LEVEL=info
ENABLE_PRETTY_LOGS=false

DATABASE_URL=postgres://openbika:openbika@localhost:5432/openbika_control

API_HOST=0.0.0.0
API_PORT=$API_PORT
API_PUBLIC_URL=$API_PUBLIC_URL
WEB_ORIGIN=$WEB_ORIGIN
BETTER_AUTH_URL=$API_PUBLIC_URL
BETTER_AUTH_SECRET=$auth_secret
VITE_API_URL=$API_PUBLIC_URL

TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=openbika-control-plane

OPENBIKA_TRAEFIK_ROUTING=$ENABLE_EDGE
OPENBIKA_INGRESS_FREE_DNS_ZONE=nip.io
OPENBIKA_INGRESS_PUBLIC_IPV4=auto
OPENBIKA_EDGE_PUBLIC_BASE_DOMAIN=
OPENBIKA_PUBLIC_BASE_DOMAIN=
EOF

  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
  chmod 0600 "$INSTALL_DIR/.env"

  cat >"$INSTALL_DIR/infra/docker/.env" <<EOF
OPENBIKA_TRAEFIK_ACME_EMAIL=$ACME_EMAIL
EOF
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/infra/docker/.env"
  chmod 0644 "$INSTALL_DIR/infra/docker/.env"

  install -d -o "$SERVICE_USER" -g "$SERVICE_USER" "$INSTALL_DIR/infra/docker/traefik/dynamic"
  touch "$INSTALL_DIR/infra/docker/traefik/dynamic/acme.json"
  chmod 0600 "$INSTALL_DIR/infra/docker/traefik/dynamic/acme.json"
}

install_dependencies() {
  log "Installing Openbika dependencies"
  run_in_install_dir "/usr/local/bin/bun install --frozen-lockfile"
}

start_compose() {
  log "Starting Postgres, Temporal, and Traefik"
  systemctl enable --now docker
  if [[ "$ENABLE_EDGE" == "true" ]]; then
    docker compose -f "$INSTALL_DIR/infra/docker/docker-compose.yml" --profile edge up -d
  else
    docker compose -f "$INSTALL_DIR/infra/docker/docker-compose.yml" up -d postgres temporal temporal-ui
  fi

  for _ in $(seq 1 60); do
    if docker compose -f "$INSTALL_DIR/infra/docker/docker-compose.yml" exec -T postgres pg_isready -U openbika -d openbika_control >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done

  echo "Postgres did not become ready in time." >&2
  docker compose -f "$INSTALL_DIR/infra/docker/docker-compose.yml" ps >&2
  exit 1
}

run_migrations_and_build() {
  log "Running migrations and build"
  local env_file
  env_file="$(printf "%q" "$INSTALL_DIR/.env")"
  run_in_install_dir "/usr/local/bin/bun --env-file=$env_file run db:migrate"
  remove_typescript_build_metadata
  run_in_install_dir "/usr/local/bin/bun --env-file=$env_file run build"
}

write_systemd_units() {
  log "Installing systemd services"
  cat >/etc/systemd/system/openbika-api.service <<EOF
[Unit]
Description=Openbika API
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
SupplementaryGroups=docker
WorkingDirectory=$INSTALL_DIR
Environment=HOME=/var/lib/$SERVICE_USER
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/bun --env-file=$INSTALL_DIR/.env $INSTALL_DIR/apps/api/src/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  cat >/etc/systemd/system/openbika-worker.service <<EOF
[Unit]
Description=Openbika Temporal Worker
After=network-online.target docker.service openbika-api.service
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
SupplementaryGroups=docker
WorkingDirectory=$INSTALL_DIR
Environment=HOME=/var/lib/$SERVICE_USER
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/bun --env-file=$INSTALL_DIR/.env $INSTALL_DIR/apps/worker/src/worker.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  cat >/etc/systemd/system/openbika-dashboard.service <<EOF
[Unit]
Description=Openbika Dashboard
After=network-online.target docker.service openbika-api.service
Wants=network-online.target openbika-api.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/apps/dashboard
Environment=HOME=/var/lib/$SERVICE_USER
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/bun run preview -- --host 0.0.0.0 --port $DASHBOARD_PORT
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable --now openbika-api.service openbika-worker.service openbika-dashboard.service
}

check_health() {
  log "Checking API health"
  local _
  local api_ready="false"

  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$API_PORT/health" >/dev/null; then
      api_ready="true"
      break
    fi
    sleep 2
  done

  if [[ "$api_ready" != "true" ]]; then
    echo "API health check did not pass. Recent logs:" >&2
    journalctl -u openbika-api -n 80 --no-pager >&2 || true
    exit 1
  fi

  log "Checking dashboard"
  for _ in $(seq 1 60); do
    if curl -fsSL --max-time 3 "http://127.0.0.1:$DASHBOARD_PORT/" >/dev/null 2>&1; then
      echo "Openbika is installed."
      echo "API: $API_PUBLIC_URL"
      echo "Dashboard: $DASHBOARD_PUBLIC_URL"
      echo "Temporal UI: http://$(public_ipv4):8080"
      echo
      echo "Useful commands:"
      echo "  systemctl status openbika-api openbika-worker openbika-dashboard"
      echo "  journalctl -u openbika-api -u openbika-worker -u openbika-dashboard -f"
      echo "  docker compose -f $INSTALL_DIR/infra/docker/docker-compose.yml ps"
      return
    fi
    sleep 2
  done

  echo "Dashboard did not become reachable on port $DASHBOARD_PORT. Recent logs:" >&2
  journalctl -u openbika-dashboard -n 80 --no-pager >&2 || true
  exit 1
}

main() {
  need_root
  require_debian_like
  install_packages
  install_bun
  ensure_service_user
  checkout_repo
  write_env_files
  install_dependencies
  start_compose
  run_migrations_and_build
  write_systemd_units
  check_health
}

main "$@"
