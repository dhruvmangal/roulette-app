#!/bin/sh
set -eu
docker compose --env-file .env -f docker-compose.yml \
  -f docker-compose.dev.yml run --rm migrate