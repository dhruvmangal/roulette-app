#!/bin/sh
set -eu
docker compose --env-file .env -f docker-compose.yml \
  -f docker-compose.dev.yml run --rm migrate \
  sh -lc 'npm run sequelize --workspace=@roulette/backend -- db:seed:all'