#!/bin/sh
# Installs Docker Engine and the Compose plugin on Linux using Docker's official
# convenience script (https://get.docker.com). Does nothing if Docker is already
# installed, so it is safe to run on every deploy.
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  echo "install-docker: not Linux, skipping (on macOS/Windows install Docker Desktop)."
  exit 0
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "install-docker: Docker and Compose already installed ($(docker --version))."
  exit 0
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  echo "install-docker: run as root or install sudo first." >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if command -v curl >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o "$TMP"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP" https://get.docker.com
else
  echo "install-docker: curl or wget is required." >&2
  exit 1
fi

$SUDO sh "$TMP"

if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now docker
fi

# Let the current user run docker without sudo (takes effect on next login).
if [ "$(id -u)" -ne 0 ] && [ -n "${USER:-}" ]; then
  $SUDO usermod -aG docker "$USER"
  echo "install-docker: added $USER to the docker group; log out and back in (or run 'newgrp docker') to use docker without sudo."
fi

docker --version 2>/dev/null || $SUDO docker --version
