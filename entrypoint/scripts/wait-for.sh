#!/bin/sh
set -eu

host="$1"
port="$2"
shift 2

until nc -z "$host" "$port"; do
  printf 'Waiting for %s:%s...\n' "$host" "$port"
  sleep 1
done

exec "$@"