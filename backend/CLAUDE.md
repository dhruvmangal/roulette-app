# Project rules — backend-boilerplate

This file is the source of truth for how code in this repo must be written.
Read it before generating or editing anything. `coding-guide.md` and
`folder-structure-guide.md` cover style/formatting and folder purpose in
more depth — this file is the condensed, AI-actionable version plus the
architectural rules that actually matter for correctness.

## Architecture (do not deviate)

Request flow is always: **route → middleware chain → controller → service → model**.

- **Routes** (`src/rest-resources/routes/**/*.routes.js`) only wire an HTTP
  verb + path to `requestValidationMiddleware` → controller method →
  `responseValidationMiddleware`. No logic here.
- **Controllers** (`src/rest-resources/controllers/*.controller.js`) are one
  class per file, static methods only, wrapped in `catchAsync`
  (`~/utils/catchAsync.utils`). A controller method calls exactly one
  service and passes the result to `sendResponse` (`~/utils/response.helpers`).
  Controllers never touch `dbModels` directly and never contain business logic.
- **Services** (`src/services/<domain>/*.service.js`) hold ALL business
  logic. Every service extends `ServiceBase` (`~/services/serviceBase`),
  implements `async run()`, and is invoked via `Service.execute(args, context)`
  from a controller (never `.run()` directly — `execute` never throws,
  `run` does). Validate service inputs by declaring a `get constraints()`
  returning a compiled AJV schema. Report business-rule failures with
  `this.addError('SomePascalCaseKey', 'message')`, not by throwing.
- **Models** (`src/db/models/*.js`) are Sequelize models: singular name,
  `underscored: true`, `smallcase_snake_case` columns, camelCase attribute
  keys. Every model file must be a plain `module.exports = (sequelize, DataTypes) => {...}` function — this is a `fs.readdirSync` autoload directory
  (`src/db/models/index.js`), so no other file shape works there.

The same shape applies to real-time features:
**namespace → socket middleware chain → handler**, mirroring the REST
pipeline (`contextSocketMiddleware` → `requestValidationSocketMiddleware` →
handler, ack via the wrapped callback). Emitters (`src/socket-resources/emitters/`)
are for server-initiated pushes outside a request/response cycle.

## Non-negotiable conventions

- **Imports**: same-folder imports stay relative (`./x`). Anything crossing
  a folder boundary (`../`) MUST use the `~` alias (`~` → `src/`), e.g.
  `import ServiceBase from '~/services/serviceBase'`. Never write a `../../..`
  chain — that's exactly the class of bug this alias exists to prevent.
- **File naming** (enforced, see `coding-guide.md` for the full table):
  `*.controller.js`, `*.service.js`, `*.routes.js`, `*.middleware.js`,
  `*.schema.js`, `*.model.js` (models here are just `<name>.js`, see above),
  `*.migration.js`, `*.seeder.js`, `*.utils.js`, `*.error.js`,
  `*.namespace.js`, `*.handler.js`, `*.emitter.js`, `*.template.js`.
- **Class naming** must match the file: `demo.controller.js` exports
  `DemoController`, `demo.service.js` exports (a class ending in) `DemoService`.
- **Errors**: never throw a raw `Error` or hand-roll an error shape. Add the
  error type to `src/utils/constants/errors.js` (stable, unique `errorCode`,
  `PascalCase` name matching the addError key pattern) and raise it via
  `this.addError('YourErrorType', 'detail')` in a service, or `next(YourErrorType)`
  in middleware/controllers. Add the user-facing string to
  `src/locals/en-US.json` if it needs to differ from the type's `description`.
- **Responses**: always go through `sendResponse` / `sendSocketResponse`
  (`~/utils/response.helpers`) so every response is `{ data, errors }`.
  Never call `res.json(...)` directly from a controller.
- **Validation**: every route gets `requestValidationMiddleware` (even with
  `{}` if there's nothing to validate) and `responseValidationMiddleware`.
  Request bodies with a schema register it in `src/json-schemas/*.schema.js`
  via `ajv.addSchema(schema, '/name.json')` and reference it with `{ $ref: '/name.json' }`
  — don't inline large body schemas in the route file.
- **Rate limiting**: a global default limiter is already applied in
  `rest-resources/index.js`. Add a stricter `rateLimiter({...})` per-route
  for anything sensitive (auth, OTP, payment-adjacent). Never set
  `distributed: true` unless Redis is actually guaranteed reachable in that
  environment — see the comment in `rateLimiter.middleware.js`.
- **Logging**: use `context.logger` / `this.log` (inside a service), never
  `console.log`. Use `Logger.error(...)` with the `exception`/`fault` keys
  so stack traces and validation failures are structured, not string-concatenated.
- **Do not reintroduce**: `crypto-js`, `moment`, `multer` — all were removed
  as unused. If you have a real need (e.g. file uploads), add the dependency
  deliberately and wire it to an actual route, don't just restore it "in case."
- **Auth is a stub on purpose** (`rest-resources/middlewares/passport.js`,
  `isAuthenticated.middleware.js`, `socket-resources/middlewares/authenticationSocketNamespace.middleware.js`).
  Do not build a signup/login flow without first adding a real `User` model
  and updating the passport verify callback to do a real lookup + status
  checks (banned/inactive/etc.) — don't just trust the JWT payload as-is
  for anything sensitive.

## Testing

- Tests live in `test/`, one file per resource, named `<resource>.routes.test.js`.
- Never hit a real Postgres/Redis in a test. Mock `~/db/models` (return a
  plain object of model stubs with `jest.fn()` methods) and `~/libs/redisClient`
  (see `test/demo.routes.test.js` for the exact pattern) before importing
  the app.
- Import `~/json-schemas` before importing `~/rest-resources` in any test
  that exercises a route with a body schema — schemas are registered as an
  import side effect, exactly like `index.js` does at boot.
- Run `npm test` (or `npm run test:watch`) before committing. CI
  (`.github/workflows/ci.yml`) runs lint → test → build on every push/PR —
  it must stay green.

## Adding a new feature

There are two generator systems. Prefer them over hand-copying files —
both produce output matching every rule above.

**`npm run generate` (Plop, deterministic, instant)** — for the common,
mechanical cases where there's no real judgment call to make. It writes
files and wires them into the shared registries (routes index, socket
namespaces index, error/success constants) with no AI involved:

- `npm run generate resource` — a full REST resource: get/create services,
  a service `index.js`, controller, routes file (mounted into
  `v1/index.js`), and a JSON schema.
- `npm run generate service` — a single extra service (e.g. `archive`,
  `cancel`) added to an existing resource's service folder.
- `npm run generate socket` — a socket handler + namespace + emitter for a
  new namespace, wired into `socket-resources/namespaces/index.js` and the
  `SOCKET_NAMESPACES` / `SOCKET_ROOMS` / `SOCKET_EMITTERS` registries in
  `utils/constants/socket.js`.
- `npm run generate model` — a Sequelize model + timestamped migration
  (optionally a seeder), from a `name:type` field list.
- `npm run generate constant` — an error type appended to `errors.js`
  (auto-assigns the next `errorCode`), a success message appended to
  `success.js`, or a brand new constants file for an unrelated topic.

Run `npm run generate` with no arguments to get the interactive prompt
menu, or `npm run generate <generator>` to jump straight to one. Templates
live in `plop-templates/*.hbs`; the generator definitions are in
`plopfile.js` — extend them there if a new mechanical pattern emerges.

**`.claude/commands/*.md` slash commands (AI-assisted, judgment-based)** —
for the same kinds of files, but when there's real wiring or reasoning to
do that a template can't decide for you: choosing what belongs in a
service's `constraints`, deciding how a new resource relates to existing
ones, adding a middleware with actual logic, or anything the Plop prompts
don't cover. See `.claude/commands/` for the full list
(`/generate-resource`, `/generate-service`, `/generate-socket`,
`/generate-model`, `/generate-constant`, `/generate-middleware`).

If you're using neither, copy the closest `demo.*` file (`src/**/demo.*`)
— those exist specifically as the canonical, always-working reference
implementation of every layer. Don't delete them; they're the example
every convention above is demonstrated against.
