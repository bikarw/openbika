#!/usr/bin/env bash
# Uninstall Openbika services from a server installed with scripts/install.sh.

set -euo pipefail

INSTALL_DIR="${OPENBIKA_INSTALL_DIR:-/opt/openbika}"
SERVICE_USER="${OPENBIKA_SERVICE_USER:-openbika}"
PURGE_DATA="false"
KEEP_WORKLOADS="false"
REMOVE_BUN="false"

usage() {
  cat <<EOF
Usage: sudo bash scripts/uninstall.sh [options]

Options:
  --install-dir PATH    Openbika install directory (default: $INSTALL_DIR)
  --service-user NAME   System user used by Openbika (default: $SERVICE_USER)
  --purge-data          Remove the repo checkout, Compose volumes, and service user home
  --keep-workloads      Leave Openbika-managed workload containers running
  --remove-bun          Remove /opt/bun and /usr/local/bin/bun if installed by install.sh
  -h, --help            Show this help

By default this removes Openbika systemd units and stops Compose containers, but
keeps persistent data so the server can be reinstalled later.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --service-user)
      SERVICE_USER="$2"
      shift 2
      ;;
    --purge-data)
      PURGE_DATA="true"
      shift
      ;;
    --keep-workloads)
      KEEP_WORKLOADS="true"
      shift
      ;;
    --remove-bun)
      REMOVE_BUN="true"
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
    echo "Run this uninstaller as root, for example: sudo bash $0" >&2
    exit 1
  fi
}

remove_systemd_units() {
  log "Removing systemd services"
  for unit in openbika-dashboard.service openbika-worker.service openbika-api.service; do
    if systemctl list-unit-files "$unit" >/dev/null 2>&1; then
      systemctl disable --now "$unit" >/dev/null 2>&1 || true
    fi
    rm -f "/etc/systemd/system/$unit"
  done
  systemctl daemon-reload
  systemctl reset-failed openbika-dashboard.service openbika-api.service openbika-worker.service >/dev/null 2>&1 || true
}

remove_workload_containers() {
  if [[ "$KEEP_WORKLOADS" == "true" ]]; then
    log "Keeping Openbika-managed workload containers"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    return
  fi

  log "Removing Openbika-managed workload containers"
  local containers
  containers="$(docker ps -aq --filter 'name=^/openbika-wl-' 2>/dev/null || true)"
  if [[ -n "$containers" ]]; then
    docker rm -f $containers >/dev/null
  fi
}

stop_compose_stack() {
  local compose_file="$INSTALL_DIR/infra/docker/docker-compose.yml"
  if [[ ! -f "$compose_file" ]] || ! command -v docker >/dev/null 2>&1; then
    log "Skipping Compose stack; $compose_file was not found"
    return
  fi

  log "Stopping Openbika Compose stack"
  if [[ "$PURGE_DATA" == "true" ]]; then
    docker compose -f "$compose_file" --profile edge down --volumes --remove-orphans
  else
    docker compose -f "$compose_file" --profile edge down --remove-orphans
  fi
}

remove_install_dir() {
  if [[ "$PURGE_DATA" != "true" ]]; then
    log "Keeping $INSTALL_DIR and Docker volumes; pass --purge-data to remove them"
    return
  fi

  log "Removing install directory"
  rm -rf "$INSTALL_DIR"
}

remove_service_user() {
  if [[ "$PURGE_DATA" != "true" ]]; then
    return
  fi

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    log "Removing service user $SERVICE_USER"
    userdel -r "$SERVICE_USER" >/dev/null 2>&1 || userdel "$SERVICE_USER" >/dev/null 2>&1 || true
  fi
}

remove_bun() {
  if [[ "$REMOVE_BUN" != "true" ]]; then
    return
  fi

  log "Removing Bun installed under /opt/bun"
  rm -f /usr/local/bin/bun
  rm -rf /opt/bun
}

main() {
  need_root
  remove_systemd_units
  remove_workload_containers
  stop_compose_stack
  remove_install_dir
  remove_service_user
  remove_bun

  echo
  echo "Openbika uninstall complete."
  if [[ "$PURGE_DATA" != "true" ]]; then
    echo "Persistent data was kept. Re-run with --purge-data to remove it."
  fi
}

main "$@"
