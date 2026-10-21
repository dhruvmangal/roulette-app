# Build prompt: Roulette (American + English) — web + mobile, Turborepo monorepo

> Paste this whole file into Claude Code (start in plan mode). Work phase by phase; stop at each CHECKPOINT and show me the result before continuing.

## 0. Read first (mandatory)
Before writing anything, read: `CLAUDE.md`, `coding-guide.md`, `folder-structure-guide.md`, `.claude/commands/*.md`, `plopfile.js`, and every `demo.*` file under `src/` (they are the reference implementation of each layer). All backend code MUST follow `CLAUDE.md`: route → middleware → controller → service → model, `ServiceBase` + `execute`, `addError` with PascalCase keys, errors registered in `src/utils/constants/errors.js`, `~` imports across folders, `sendResponse`, AJV schemas, no `console.log`, tests with mocked `~/db/models` and `~/libs/redisClient`. Prefer `npm run generate <resource|service|socket|model|constant>` over hand-copying files. Do not reintroduce `crypto-js`, `moment`, `multer`.

## 1. Product
A virtual-money roulette game for web and mobile (App Store / Play Store). **No real money, no cash-out, no purchases that convert to cash.** Chips only.

**Variants** (one engine, config-driven):
- **American**: 38 pockets (0, 00, 1–36). Extra bet: top line / basket (0,00,1,2,3) pays 6:1.
- **English** (single-zero, a.k.a. European): 37 pockets (0, 1–36).

**Play modes**
1. **Vs computer (online)**: server-run table where bots fill empty seats; real RNG on the server.
2. **Private room**: create a room, get a join code, friends join, host configures it.
3. **Public multiplayer**: lobby/quick-match into public tables with other real users.
4. **Offline**: fully on-device (local engine, local practice wallet, no network). Practice chips are separate from the server wallet and never sync (prevents exploits). Offline can still run with bots.

**Table rules**
- Max **8 seats** per table (ASSUMPTION: "8 slots" = 8 players per table; confirm with me). Roulette is player-vs-house: players share one wheel spin, they do not play against each other.
- **N rounds**: room config `totalRounds` (1..N, or `null` = unlimited until everyone leaves). Round state machine: `BETTING (timer) → BETS_CLOSED → SPINNING → RESULT → PAYOUT → next round | ENDED`.
- Session/room end shows a summary (net win/loss, biggest win, rounds played) and a leaderboard.

**Wallet, transactions, bonuses** (virtual chips) — see §4.

## 2. Decisions (defaults; flag any you disagree with before building)
- **D1 Client stack**: `frontend/` = Vite + React + TypeScript, game scene in **Phaser 3** (wheel, ball, table), UI in React. `mobile/` packages that same build for iOS/Android with **Capacitor** (single UI codebase). Alternative: Expo/React Native in `mobile/` sharing only `packages/`. Default to Capacitor.
- **D2 Turborepo**: yes, at the repo root, orchestrating `dev/build/lint/test/typecheck` across `frontend`, `backend`, `mobile` and `packages/*`. Docker runs the services; native store builds (Xcode, Gradle) stay outside turbo/Docker except the optional Android build container.
- **D3 Money**: integer chips in `BIGINT` columns (never float/DECIMAL math in JS). Remember Sequelize returns BIGINT as string — normalize in one place.
- **D4 RNG**: server uses `crypto.randomInt`. Optional Phase 9: provably-fair commit–reveal (server publishes `sha256(serverSeed)` before betting, reveals after round).
- **D5 Backend language**: keep the boilerplate in JS (Babel). New shared packages are TypeScript, built with `tsup` to ESM+CJS `dist/`, consumed by the backend as built workspace dependencies.

## 3. Repository layout & Docker (Phase 0)
Top-level folder structure is FIXED (do not rename or add other top-level folders except `packages/` for shared code and the root config files):
```
roulette/
  package.json  turbo.json  tsconfig.base.json  .gitignore  .editorconfig  README.md   ← root workspace (npm workspaces + Turborepo)
  frontend/     ← web app: Vite + React + TypeScript + Phaser 3 (also the single UI source for mobile)
  backend/      ← the existing boilerplate moved here (keep ~ alias, Plop, tests, CLAUDE.md, guides, .claude/commands, CI-compatible)
  mobile/       ← iOS/Android shell (Capacitor, webDir = ../frontend/dist) + native config, icons, splash, store assets
  entrypoint/   ← EVERYTHING that starts the stack: nginx/, docker-compose*.yml, .env.example, scripts/, Makefile
  packages/     ← shared TS code consumed by frontend, mobile, backend
    roulette-engine/  contracts/  game-client/  api-client/  ui/  config/
```
(`mobile/` default = Capacitor so the UI is written once in `frontend/`. If I later choose Expo/React Native instead, `mobile/` becomes the Expo app and shares only `packages/`. Ask me once at the start of Phase 0.)

**Everything runs in Docker** — website, backend, Redis, Postgres, RedisInsight, pgAdmin, nginx. A fresh machine with only Docker installed must be able to run the whole stack with one command. Put all of it in `entrypoint/`:
```
entrypoint/
  docker-compose.yml          ← base: shared service definitions, networks, volumes, healthchecks
  docker-compose.dev.yml      ← dev overrides: bind mounts, hot reload (vite dev server, nodemon/babel-node), exposed ports
  docker-compose.prod.yml     ← prod overrides: built images, restart policies, no dev tools, no source mounts
  .env.example  (+ .env.dev / .env.prod are gitignored)
  nginx/
    nginx.conf  conf.d/default.conf (dev)  conf.d/prod.conf  (+ certs/ placeholder for TLS)
  scripts/                    ← wait-for, db migrate/seed, backup/restore, reset-dev-data
  Makefile                    ← make dev | prod | down | logs | migrate | seed | psql | redis-cli | reset
```
Services (all named, on one internal network; only nginx publishes 80/443 in prod):
- `nginx`: reverse proxy. `/` → frontend; `/api/` → backend; `/socket.io/` → backend with WebSocket upgrade headers (`Upgrade`/`Connection`), long `proxy_read_timeout`; gzip, security headers, request-size limits; sticky behaviour not required because the Socket.IO Redis adapter is used. Optionally proxy `/pgadmin/` and `/redisinsight/` in DEV only.
- `frontend`: dev = Vite dev server (HMR through nginx); prod = multi-stage build → static files served by a small nginx/static image.
- `backend`: multi-stage Dockerfile (the existing one adapted for the monorepo; use `turbo prune backend --docker` so only needed workspaces are built, including `packages/*` it depends on). Runs as non-root, has `/health` healthcheck (the boilerplate already has `healthCheck.js`). Uses env vars from the compose file (`DB_READ_HOST/DB_WRITE_HOST=postgres`, `REDIS_DB_HOST=redis`, `JWT_LOGIN_SECRET`, ...).
- `migrate`: one-shot service that runs Sequelize migrations (and seeders in dev) after Postgres is healthy; `backend` depends on it completing.
- `postgres`: official image, named volume, healthcheck (`pg_isready`), not published to the host in prod.
- `redis`: official image, named volume, AOF persistence, password enabled, healthcheck.
- `redisinsight`: RedisInsight UI (tools profile), pre-wired to `redis`.
- `pgadmin`: pgAdmin 4 (tools profile), pre-seeded `servers.json` pointing at `postgres`.
- Tools (`pgadmin`, `redisinsight`) use compose `profiles: ["tools"]`, bind only to `127.0.0.1` (or are reachable via nginx behind basic auth) and are NEVER exposed publicly in prod.
- Use `depends_on` with `condition: service_healthy`, pinned image versions (no `latest`), `.dockerignore` per app, named volumes (`pgdata`, `redisdata`, `pgadmin`, `redisinsight`), and secrets only from env files (never committed).
- `mobile/`: native iOS builds need macOS/Xcode and cannot be Dockerised. Do provide an OPTIONAL Docker service/script for the **Android** build (JDK + Android SDK + Gradle) so APK/AAB can be built reproducibly; iOS stays a documented manual step. The dev mobile app must reach the stack via the host's LAN IP / nginx (document `VITE_API_URL` and Capacitor `server.url` for live reload on a device).

Turborepo (`turbo.json`) pipelines: `dev` (persistent, no cache), `build` (dependsOn `^build`, cached), `lint`, `test`, `typecheck`. Docker runs the stack; Turborepo runs tasks inside the containers/CI (`turbo run build`, `turbo run test`). Root scripts: `npm run dev` (docker compose dev via entrypoint), `npm run build`, `npm test`.

Requirements: move the boilerplate into `backend/` in its own commit; update its `Dockerfile`, `k8s`, `.github/workflows/ci.yml`, `.husky`, `Makefile` paths so CI stays green (lint → test → build). Add a root README with the 3-command quick start.
**CHECKPOINT 0**: from a clean clone, `cd entrypoint && make dev` brings up nginx, frontend, backend, postgres, redis (+ `--profile tools` brings up pgAdmin and RedisInsight); `http://localhost` shows the frontend; `/api/health` responds through nginx; a Socket.IO connection works through nginx; migrations ran; `npm test` and CI pass.

## 4. Backend (backend) — follow the boilerplate patterns exactly

### 4.1 Prerequisite: real identity (CLAUDE.md requires this before any auth flow)
- `Player` model (`players`): id, username (unique), email (nullable, for guests), passwordHash, isGuest, status (`active|banned|inactive`), avatar, country, lastLoginAt.
- Services: `PlayerSignUp`, `PlayerLogin`, `GuestLogin`, `RefreshToken`, `GetProfile` using `hashPassword`/`signAccessToken` from `auth.utils.js`.
- Replace the stub in `passport.js` with a real `Player` lookup + status checks (reject banned/inactive). Same for the socket auth middleware. Strict per-route `rateLimiter` on signup/login.

### 4.2 Wallet / ledger (build with the boilerplate's transaction mechanism)
No wallet code exists in the boilerplate, so create it using `contextMiddleware(true)` (automatic commit/rollback via `context.sequelizeTransaction`) and pass `transaction` through the `crud.js` helpers. Generate with `npm run generate model` + `resource`.
- `Wallet` (`wallets`): playerId (unique), balance BIGINT ≥ 0 (DB CHECK constraint), lockedBalance, currency=`CHIP`, version.
- `WalletTransaction` (`wallet_transactions`) — **append-only ledger, never updated/deleted**: id, walletId, playerId, type (`SIGNUP_BONUS|DAILY_BONUS|REFILL_BONUS|BET|WIN|REFUND|ADMIN_ADJUST`), direction (`CREDIT|DEBIT`), amount > 0, balanceBefore, balanceAfter, referenceType (`ROUND|BET|BONUS|ADMIN`), referenceId, **idempotencyKey (unique)**, metadata JSONB, createdAt.
- ONE reusable internal service `ApplyWalletTransaction` (`src/services/wallet/`) is the ONLY code allowed to change a balance. It: locks the wallet row (`transaction.LOCK.UPDATE`), rejects insufficient funds via `addError('InsufficientBalance', ...)`, is idempotent on `idempotencyKey` (replay returns the original ledger row), writes ledger + new balance atomically. Every other service (bets, payouts, bonuses, refunds) calls it with the caller's transaction.
- REST: `GET /wallet` (balance), `GET /wallet/transactions` (paginated, filter by type/date). Players cannot credit themselves.
- Invariant to test: `wallet.balance === sum(credits) - sum(debits)` per wallet, and concurrent bets can never overdraw (test with parallel calls).

### 4.3 Bonuses
- `Bonus` (config table, editable without deploy): code, type, amount, cooldownSeconds, maxClaims, minBalanceThreshold, isActive.
- `PlayerBonus` (claims): playerId, bonusId, claimedAt, streakDay, ledger transaction id. Unique constraint to prevent double claims.
- Bonus types: **signup** (once, auto-granted on signup), **daily** (24h cooldown, streak escalates, resets if missed), **refill** (when balance < threshold, cooldown-limited so a broke player can keep playing), plus a hook for future promo codes. Claim via `ClaimBonus` service → `ApplyWalletTransaction`. Endpoints: `GET /bonuses` (what's claimable now + next availability), `POST /bonuses/:code/claim`.

### 4.4 Game domain models
`Room` (code, variant `AMERICAN|ENGLISH`, mode `VS_COMPUTER|PRIVATE|PUBLIC`, maxSeats ≤ 8, totalRounds nullable, minBet, maxBet, bettingSeconds, status, hostPlayerId), `RoomPlayer` (roomId, playerId nullable for bots, seat 1–8, isBot, botProfile, joinedAt/leftAt, UNIQUE(roomId, seat)), `Round` (roomId, roundNumber, status, winningPocket, startedAt, resultAt, seedHash/seed for D4), `Bet` (roundId, playerId, betType, selection JSONB, amount, payout, status `PLACED|WON|LOST|REFUNDED`, ledger ids).

### 4.5 Game services, REST, sockets
- REST resources: rooms (create/list public/get/join-by-code/leave), game history, leaderboard.
- Socket namespace `/roulette` (generate with `npm run generate socket`; register in `SOCKET_NAMESPACES/ROOMS/EMITTERS`): client→server `room:join`, `room:leave`, `bet:place`, `bet:remove`, `bet:clear`, `bet:repeatLast`; server→client `round:phase`, `round:tick`, `bet:accepted`, `round:result`, `wallet:updated`, `room:state`, `room:playerJoined/Left`. Authoritative server: clients NEVER send outcomes; the server validates seat membership, phase, min/max bet, bet legality (via the engine) and funds.
- `PlaceBet` debits the wallet via `ApplyWalletTransaction` inside one DB transaction; `SettleRound` computes payouts with the engine and credits winners in one transaction; round cancel/crash → `REFUND`. Idempotent (a round settles exactly once).
- **RoundOrchestrator**: drives the state machine per room using timers + Redis (distributed lock per room so only one node runs a room; recover in-flight rooms on boot). Emits via the Redis socket emitter. Bots auto-place bets using strategy classes (cautious / martingale / random / number-chaser) from `game-client`/engine so offline and online bots are identical.
- Add every new error to `errors.js` (via `npm run generate constant`), success messages to `success.js`, strings to `en-US.json`.
**CHECKPOINT 2/3**: with only curl/socket scripts I can sign up, get the signup bonus, create a room, place bets, see a round settle, and the ledger balances.

## 5. Engine (packages/roulette-engine) — Phase 1, build FIRST, before the backend game code
Pure functions, data-driven, so both variants and server + offline client share one implementation:
- `VARIANTS = { AMERICAN, ENGLISH }` each with: `pockets`, `wheelOrder` (physical sequence, for animation), colors, `allowedBetTypes`.
- Wheel orders (add a test that each is a permutation of its pockets):
  - English: 0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
  - American: 0,28,9,26,30,11,7,20,32,17,5,22,34,15,3,24,36,13,1,00,27,10,25,29,12,8,19,31,18,6,21,33,16,4,23,35,14,2
- Red: 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36. 0 and 00 are green.
- Bet types & payouts (N:1): straight 35, split 17, street 11, corner 8, six-line 5, column 2, dozen 2, red/black/odd/even/low(1–18)/high(19–36) 1, **top line (American only) 6**.
- API: `validateBet(variant, bet)`, `coveredPockets(variant, bet)`, `settle(variant, bets, winningPocket) → per-bet payout`, `spin(variant, rng) → pocket`, `tableLayout(variant)` (grid geometry/hit-areas for the UI so placing chips is also data-driven), `neighbors/racetrack` helpers optional.
- Tests (must pass): exhaustive check that for every bet type the expected value is exactly `-1/37` (English) and `-1/38` (American, except top line `-5/38`); adjacency rules for split/corner/street/six-line; 00 handling; settle returns stake + winnings correctly; no use of `Math.random`/`Date`.

## 6. Client (frontend) — reusable by design
- **GameTransport interface** (`join, leave, placeBet, removeBet, clear, onPhase, onResult, ...`) with `LocalTransport` (offline: engine + bots + local timers) and `SocketTransport` (online). **All UI talks only to the interface**, so every screen works identically in every mode.
- **WalletAdapter interface** with `LocalWalletAdapter` (practice chips in on-device storage) and `RemoteWalletAdapter` (REST + `wallet:updated` events).
- State: Zustand (or equivalent) stores in `game-client`; React Query for REST. No game logic in components.
- Screens: splash/login/guest, home (mode picker: vs computer / private room / public / offline), variant select, lobby/room list/join-by-code, table (felt layout, chip tray, bet history, repeat/double/undo, timer, seats strip showing up to 8 players, wheel + ball animation landing exactly on the server's winning pocket, win celebration), wallet (balance, ledger), bonuses (daily streak, claim), round/session summary, leaderboard, settings (sound, haptics, language).
- Phaser scene is a thin renderer driven by state/events; React owns menus/HUD. Layout must be responsive for phone portrait/landscape and desktop; handle safe areas; unlock audio on first touch; texture atlases for perf on low-end Android.
- Capacitor (lives in `mobile/`): `cap add ios android`, icons/splash, haptics, status bar, app lifecycle (pause/resume timers and reconnect sockets), network status (auto switch to offline mode prompt). Socket reconnect must resync room + round state.
- i18n-ready strings; shared design tokens in `packages/ui`.

## 7. Store & compliance notes (verify current Apple/Google policies before submission)
Simulated gambling must be clearly labelled "no real money / no prizes", use an appropriate age rating (typically 17+/Mature), include a privacy policy, account deletion in-app (Apple requirement), and never allow chips to be redeemed for cash/prizes. Real-money purchases of chips are out of scope for v1.

## 8. Phases & checkpoints
0. Repo layout (frontend/backend/mobile/entrypoint), Turborepo, Docker stack (nginx, postgres, redis, RedisInsight, pgAdmin), move boilerplate → CP0
1. `roulette-engine` + tests → CP1 (show test output, incl. house-edge proof)
2. Backend: players/auth, wallet ledger, bonuses → CP2
3. Backend: rooms, rounds, orchestrator, sockets, bots → CP3
4. `contracts`, `api-client`, `game-client` (transports, stores, bots)
5. Client UI: auth, home, wallet, bonuses
6. Client table + Phaser wheel (offline mode first, then online)
7. Private/public rooms + reconnect + leaderboard
8. `mobile/` Capacitor builds (Android first, optional Docker build), perf pass on a low-end device
9a. Production compose: TLS in nginx, secrets, backups, healthchecks verified
9. Optional: provably-fair, admin endpoints (adjust wallet, edit bonuses), analytics

## 9. Working rules
- Make a TODO list per phase; run `npm run lint` and `npm test` before each commit; keep CI green; one commit per logical step.
- Do not invent money logic outside `ApplyWalletTransaction`. Do not trust client input. Do not duplicate game rules between server and client — only the engine knows the rules.
- If something in this prompt conflicts with `CLAUDE.md`, `CLAUDE.md` wins; tell me.
- Ask me before: changing the repo layout/tool/stack, adding a dependency not listed, or deviating from the schemas above.
- Start now with Phase 0: output a short plan, ask the D1 question and confirm the "8 slots = 8 seats" assumption, then proceed.
