#!/bin/sh
set -eu
set -a
. ./.env
set +a
output="${1:-backups/roulette-$(date +%Y%m%d%H%M%S).sql}"
mkdir -p "$(dirname "$output")"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$output"
printf 'Database backup written to %s\n' "$output"