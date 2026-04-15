#!/usr/bin/env bash
set -euo pipefail; IFS=$'\n\t'

# One-time host setup for traefik-proxy.
# Creates the shared Docker network and ACME storage files with correct permissions.
# Safe to re-run.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info()  { echo "[INFO]  $*"; }
ok()    { echo "[OK]    $*"; }
error() { echo "[ERROR] $*" >&2; exit 1; }

# --- Docker network ---
if docker network inspect traefik-public &>/dev/null; then
  ok "traefik-public network already exists"
else
  info "Creating traefik-public Docker network..."
  docker network create traefik-public
  ok "traefik-public created"
fi

# --- ACME storage files ---
# Traefik requires the acme.json files to exist and be mode 600 before first run.
LETSENCRYPT_VOL="$(docker volume inspect traefik-proxy_traefik_letsencrypt --format '{{.Mountpoint}}' 2>/dev/null || true)"

if [[ -n "${LETSENCRYPT_VOL}" ]]; then
  for f in acme-staging.json acme-prod.json; do
    fp="${LETSENCRYPT_VOL}/${f}"
    if [[ ! -f "${fp}" ]]; then
      info "Creating ${fp}..."
      touch "${fp}"
      chmod 600 "${fp}"
      ok "${f} created"
    else
      # Ensure permissions correct even if file already exists
      chmod 600 "${fp}"
      ok "${f} exists"
    fi
  done
else
  info "Volume not yet created (run docker compose up first, then re-run this script for ACME files)"
fi

# --- .env ---
ENV_FILE="${SCRIPT_DIR}/../.env"
EXAMPLE_FILE="${SCRIPT_DIR}/../.env-example"
if [[ ! -f "${ENV_FILE}" ]]; then
  info "Copying .env-example to .env — edit before starting Traefik"
  cp "${EXAMPLE_FILE}" "${ENV_FILE}"
else
  ok ".env already exists"
fi

ok "Setup complete. Review .env, then:"
echo "  Wolfcraig: docker compose -f docker-compose.yml -f docker-compose.wolfcraig.yml up -d"
echo "  Local:     docker compose up -d"
