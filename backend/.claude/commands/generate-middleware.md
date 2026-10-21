---
description: Scaffold a new REST or socket middleware following this project's middleware conventions.
argument-hint: <rest|socket> <name> <short purpose>
---

Generate a new middleware. `$ARGUMENTS` gives the kind (`rest` or
`socket`), a name (e.g. `requireAdmin`), and a short description of what it
should check/do.

**REST middleware** (`rest` kind):
- File: `src/rest-resources/middlewares/<name>.middleware.js`.
- Export a single default function. If it takes configuration, it should
  be a factory: `export default function <name>Middleware(options = {}) { return (req, res, next) => {...} }`
  (see `requestValidation.middleware.js`). If it's a fixed check with no
  config, export the `(req, res, next)` function directly (see
  `isAuthenticated.middleware.js`).
- On failure, call `next(SomeErrorType)` using (or adding, via
  `/generate-constant`) an entry from `~/utils/constants/errors` — never
  send a response directly from a non-terminal middleware, and never throw
  synchronously from inside the returned handler without wrapping in
  try/catch if anything async can reject.
- JSDoc the function like the existing middlewares: what it does, when to
  apply it, an `@example` of applying it to a route.

**Socket middleware** (`socket` kind):
- File: `src/socket-resources/middlewares/<name>.middleware.js`.
- Two shapes exist in this codebase — pick the one that matches the need:
  - Namespace-level (applied once via `namespace.use(...)`, e.g. auth):
    `export default async function <name>Middleware(socket, next) {...}`,
    call `next(SomeErrorType)` on failure (see
    `authenticationSocketNamespace.middleware.js`).
  - Per-event (applied via `socket.use(...)` inside the `connection`
    handler, runs on every incoming event): `export default function <name>Middleware(...) { return (args, next) => {...} }`
    (see `contextSocket.middleware.js` / `requestValidationSocket.middleware.js`).
    Never register this shape with `socket.on()` — see the warning in
    `/generate-socket`.

After creating the file, tell me where to apply it (which route(s) or
namespace(s)) rather than wiring it in automatically, unless I named a
specific route/namespace in the description.

Run `npm run lint` when done.
