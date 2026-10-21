#!/bin/sh
set -eu
set -a
. ./.env
set +a
input="${1:?Usage: scripts/restore.sh backup.sql}"
docker compose exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB" < "$input"