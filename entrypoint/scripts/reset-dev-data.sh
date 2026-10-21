#!/bin/sh
set -eu
docker compose down
docker volume rm "${COMPOSE_PROJECT_NAME:-roulette}_pgdata" \
  "${COMPOSE_PROJECT_NAME:-roulette}_redisdata" 2>/dev/null || true
printf 'Development database and Redis volumes removed.\n'