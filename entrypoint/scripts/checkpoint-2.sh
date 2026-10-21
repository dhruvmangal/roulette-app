#!/bin/sh
# Checkpoint 2: accounts, wallet ledger and bonuses, end to end against the
# running dev stack (`make dev`). Needs curl and jq. Run from entrypoint/.
set -eu
set -a
. ./.env
set +a

API="${API:-http://localhost/api/v1}"
dc() { docker compose --env-file .env -f docker-compose.yml -f docker-compose.dev.yml "$@"; }
sql() { dc exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAIL: %s\033[0m\n' "$1"; exit 1; }

step '1. Play as a guest'
signup=$(curl -sf -X POST "$API/auth/guest")
token=$(echo "$signup" | jq -r '.data.tokens.accessToken')
refresh=$(echo "$signup" | jq -r '.data.tokens.refreshToken')
player_id=$(echo "$signup" | jq -r '.data.player.playerId')
balance=$(echo "$signup" | jq -r '.data.wallet.balance')
echo "player $player_id ($(echo "$signup" | jq -r '.data.player.username')), balance $balance"
[ "$balance" = 1000 ] || fail "signup bonus should give 1000 chips"

step '2. Bonuses on offer'
curl -sf "$API/bonuses" -H "Authorization: Bearer $token" \
  | jq -r '.data.bonuses[] | "\(.code): claimable=\(.claimable) amount=\(.amount) \(.reason // "")"'

step '3. Ten simultaneous claims of the daily bonus'
for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/bonuses/DAILY/claim" -H "Authorization: Bearer $token" &
done > /tmp/cp2-claims.$$
wait
ok=$(grep -c '^200$' /tmp/cp2-claims.$$ || true)
rm -f /tmp/cp2-claims.$$
echo "$ok of 10 succeeded"
[ "$ok" = 1 ] || fail "exactly one daily claim should succeed"

step '4. Wallet and ledger'
curl -sf "$API/wallet" -H "Authorization: Bearer $token" | jq -c '.data.wallet'
curl -sf "$API/wallet/transactions" -H "Authorization: Bearer $token" \
  | jq -r '.data.transactions.rows[] | "\(.type) \(.direction) \(.amount): \(.balanceBefore) -> \(.balanceAfter)"'

step '5. Twenty simultaneous 100-chip debits on the real database'
dc exec -T -w /repo/backend backend npx babel-node -e "
  const models = require('~/db/models')
  const { ApplyWalletTransactionService } = require('~/services/wallet')
  const context = { dbModels: models.default, sequelize: models.sequelize }
  Promise.all(Array.from({ length: 20 }, (_, i) => ApplyWalletTransactionService.execute(
    { playerId: $player_id, amount: 100, direction: 'DEBIT', type: 'BET', idempotencyKey: 'cp2:$player_id:' + i }, context
  ))).then(results => {
    console.log(results.filter(r => r.successful).length + ' of 20 debits succeeded')
    return models.sequelize.close()
  })
" 2>/dev/null | tail -1
balance=$(sql "SELECT balance FROM wallets WHERE player_id = $player_id")
echo "balance now $balance"
[ "$balance" = 0 ] || fail "1100 chips should cover exactly 11 debits, leaving 0"

step '6. Ledger invariant: balance = credits - debits, for every wallet'
broken=$(sql "
  SELECT count(*) FROM wallets w
  LEFT JOIN (
    SELECT wallet_id, sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END) AS total
    FROM wallet_transactions GROUP BY wallet_id
  ) l USING (wallet_id)
  WHERE w.balance <> coalesce(l.total, 0)")
echo "$(sql 'SELECT count(*) FROM wallets') wallets checked, $broken out of balance"
[ "$broken" = 0 ] || fail "ledger and balances disagree"

step '7. The ledger is append-only'
if sql "UPDATE wallet_transactions SET amount = 1 WHERE player_id = $player_id" >/dev/null 2>&1; then
  fail "an UPDATE on the ledger was allowed"
fi
echo 'UPDATE rejected by the database'

# post <path> [json body] [access token]: prints the HTTP status; the body is left for `body`.
post() {
  data=${2:-'{}'}
  if [ -n "${3:-}" ]; then
    curl -s -o /tmp/cp2-body.$$ -w '%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $3" -d "$data"
  else
    curl -s -o /tmp/cp2-body.$$ -w '%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' -d "$data"
  fi
}
body() { cat /tmp/cp2-body.$$; }
# Seconds a JWT is valid for (exp - iat), read from its unpadded base64url payload.
lifetime() { echo "$1" | cut -d. -f2 | jq -rR 'gsub("-";"+") | gsub("_";"/") | @base64d | fromjson | .exp - .iat'; }

refresh_body() { jq -nc --arg token "$1" '{refreshToken: $token}'; }

step '8. Access tokens last 15 minutes'
seconds=$(lifetime "$token")
echo "access token lifetime: ${seconds}s"
[ "$seconds" = 900 ] || fail 'access tokens should last 15 minutes'

step '9. Refresh rotates the token; a stolen old one revokes the whole login'
status=$(post /auth/refresh "$(refresh_body "$refresh")"); [ "$status" = 200 ] || fail "refresh failed ($status)"
rotated=$(body | jq -r '.data.tokens.refreshToken')
[ "$rotated" != "$refresh" ] || fail 'the refresh token should change'
echo 'refresh ok: a new refresh token was issued'
echo 'waiting 11s, past the two-tabs grace window...'
sleep 11
status=$(post /auth/refresh "$(refresh_body "$refresh")"); [ "$status" = 401 ] || fail "a used refresh token should be refused ($status)"
status=$(post /auth/refresh "$(refresh_body "$rotated")"); [ "$status" = 401 ] || fail "reuse should revoke the rest of the family ($status)"
echo 'old token refused, and its successor revoked with it'

step '10. Logout ends a login; logout-all ends every one'
status=$(post /auth/guest); [ "$status" = 200 ] || fail "guest login failed ($status)"
second_id=$(body | jq -r '.data.player.playerId')
second_access=$(body | jq -r '.data.tokens.accessToken')
second_refresh=$(body | jq -r '.data.tokens.refreshToken')
status=$(post /auth/refresh "$(refresh_body "$second_refresh")"); [ "$status" = 200 ] || fail "refresh failed ($status)"
second_refresh=$(body | jq -r '.data.tokens.refreshToken')
status=$(post /auth/logout "$(refresh_body "$second_refresh")"); [ "$status" = 200 ] || fail "logout failed ($status)"
status=$(post /auth/refresh "$(refresh_body "$second_refresh")"); [ "$status" = 401 ] || fail "a logged-out token should be refused ($status)"
echo 'logged-out refresh token refused'
status=$(post /auth/logout-all '{}' "$second_access"); [ "$status" = 200 ] || fail "logout-all failed ($status)"
status=$(curl -s -o /dev/null -w '%{http_code}' "$API/wallet" -H "Authorization: Bearer $second_access")
[ "$status" = 403 ] || fail "access tokens should stop working at once ($status)"
echo 'logout-all: access tokens stopped working immediately'
live=$(sql "SELECT count(*) FROM player_sessions WHERE player_id = $second_id AND revoked_at IS NULL")
[ "$live" = 0 ] || fail "every session should be revoked ($live live)"
echo 'every session for the player is revoked'

step '11. Only Google and Apple sign-in; passwords are gone'
for path in /auth/sign-up /auth/login /auth/upgrade; do
  status=$(post "$path" '{"login":"a","username":"a","password":"whatever1"}'); [ "$status" = 404 ] || fail "$path should be gone ($status)"
done
echo 'password sign-up, login and upgrade: 404'
status=$(post /auth/facebook '{"idToken":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'); [ "$status" = 404 ] || fail "only google and apple ($status)"
[ "$(sql "SELECT count(*) FROM information_schema.columns WHERE table_name = 'players' AND column_name IN ('password_hash', 'email')")" = 0 ] || fail 'players should hold no passwords or emails'
echo 'no password or email columns on players'
if [ -z "${GOOGLE_CLIENT_IDS:-}" ]; then
  status=$(post /auth/google '{"idToken":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'); [ "$status" = 503 ] || fail "unconfigured Google should say so ($status)"
  echo 'Google is not configured yet: 503 ProviderNotConfigured (set GOOGLE_CLIENT_IDS to enable it)'
else
  status=$(post /auth/google '{"idToken":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}'); [ "$status" = 401 ] || fail "a forged Google token should be refused ($status)"
  echo 'a forged Google token is refused: 401'
fi
rm -f /tmp/cp2-body.$$

printf '\n\033[32mCheckpoint 2 passed.\033[0m\n'
