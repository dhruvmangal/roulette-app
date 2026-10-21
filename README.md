# Roulette

Virtual-chip American and European roulette for web and mobile. No real-money
play, cash-out, or prizes.

## Quick start

1. Install Docker Desktop and Node.js 20 or newer.
2. Copy `entrypoint/.env.example` to `entrypoint/.env` and set the secrets.
3. Run `npm run dev` from the repository root, then open <http://localhost>.

The dev stack includes nginx, the frontend, backend, PostgreSQL, and Redis.
Run `cd entrypoint && make dev-tools` to include pgAdmin and RedisInsight.

The backend source, generators, tests, and conventions live in `backend/`.
Mobile is an Expo app; iOS builds require macOS and Xcode. For on-device dev,
set `EXPO_PUBLIC_API_URL` to the host machine's LAN address.

## Admin app

`admin/` is a separate React app at <http://localhost/admin/>, in its own
container, for support and operations staff. It covers players, wallets, the
transaction ledger, tables, bonuses, chat reports, and an audit log. It talks to
`/api/v1/admin`.

- Admins are staff accounts in `admin_users` (email and password), unrelated
  to players. Set `JWT_ADMIN_SECRET` (a third secret) in `entrypoint/.env` to
  turn the app on. `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` create
  the first admin when the backend starts.
- Chip adjustments are `ADMIN_ADJUST` rows on the append-only ledger. Each row
  names the admin and the reason, and is idempotent per form submission. A debit
  never takes a balance below zero.
- Banning or deactivating a player revokes their tokens and drops their open
  sockets.
- Every change an admin makes is written to `admin_audit_logs`. A database
  trigger makes that table append-only.

## Devices and visits

When a player signs in, and when the app comes back to the foreground (at most
every 30 minutes), the app reports the device it runs on. That covers platform,
OS, browser or phone model, emulator or not, screen, language, time zone,
orientation, and network type and quality. The server adds the IP address and an
approximate place for it from DB-IP's free city database
(IP geolocation by [DB-IP](https://db-ip.com), CC BY 4.0).

- No permission prompts: no GPS, no Wi-Fi network names, no fingerprinting.
- The install id is a random value kept in the app's own storage.
- Visits are deleted after 90 days.
- The admin app shows devices, recent visits, and other accounts seen on the
  same device or IP address.
- The privacy policy must describe all of this.

## Dealer avatars

The table's Dealer view offers two croupiers (credits in
`frontend/public/dealer/CREDITS.txt`):

- **Anime** (default): "Blonde Anime Medic Girl" by Farah Aziz on Sketchfab,
  CC BY 4.0, which requires the on-screen credit. It is an unrigged bust, animated
  procedurally. Put the Sketchfab GLB at `frontend/assets-src/medic.glb`
  (gitignored) and run `npm run build:medic -w @roulette/frontend`.
- **Classic**: `Business_Female_01` from
[Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) (MIT,
notice in `frontend/public/dealer/LICENSE.txt`). The optimised files in
`frontend/public/dealer/` are generated from the Rocketbox FBX/TGA sources with
`node frontend/scripts/build-dealer.mjs <raw-dir>` (macOS, uses `sips`).

## Workspace commands

- `npm run dev`: start the Docker development stack.
- `npm run build`: build all workspaces with Turborepo.
- `npm test`: run workspace tests.
- `npm run lint`: lint all workspaces.
- `npm run typecheck`: typecheck TypeScript workspaces.

The shared packages and roulette engine are introduced in subsequent phases.