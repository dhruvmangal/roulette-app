---
description: Scaffold a full Socket.io feature (namespace + handler + emitter), wired the same way the demo namespace is.
argument-hint: <name> [event1 event2 ...]
---

Generate a new socket namespace named `$ARGUMENTS` (first word is the
name, e.g. `chat`; any following words are event names it should handle,
e.g. `message typing` — default to a single `ping`-style event if none
given).

Use `src/socket-resources/namespaces/demo.namespace.js`,
`src/socket-resources/handlers/demo.handler.js`, and
`src/socket-resources/emitters/demo.emitter.js` as the literal templates.
Follow the exact middleware order from the template — this is the one
place in the codebase that's easy to get backwards:

```
socket.use(contextSocketMiddleware(socket, schemas))
socket.use(requestValidationSocketMiddleware)
socket.on(eventName, Handler.method)
```

`contextSocketMiddleware` and `requestValidationSocketMiddleware` are
registered via `socket.use()` (they run on every incoming event); the
actual handler is registered via `socket.on(eventName, ...)` and receives
the already-decorated `({ payload, context }, ack)` args. Do not register a
middleware via `socket.on()` or a handler via `socket.use()` — that breaks
the whole pipeline silently (no error, events just never fire correctly).

Create:

1. Add namespace/room/emitter constants to `src/utils/constants/socket.js`
   (`SOCKET_NAMESPACES.<NAME>`, `SOCKET_ROOMS.<NAME>_ROOM`, and one
   `SOCKET_EMITTERS.<NAME>_<EVENT>` per emitted event) — kebab-case for the
   namespace path (`/chat`), CAPITAL_SNAKE_CASE for the rest, per
   `coding-guide.md`.
2. `src/socket-resources/handlers/<name>.handler.js` — `<Name>Handler` with
   one static async method per given event, each `({ payload, context },
   ack)`, logging via `context.logger`, acking via `ack({ data, errors: [] })`.
3. `src/socket-resources/namespaces/<name>.namespace.js` — build per-event
   schemas with `socketSchemaBuilder({...})` from `~/libs/ajv`, join the
   namespace's room on connection, wire the middleware chain above, and
   `socket.on(event, <Name>Handler.<event>)` for each event.
4. If the feature needs to push events to clients from outside a
   request/response cycle (e.g. from a service or a cron job), also create
   `src/socket-resources/emitters/<name>.emitter.js` — `<Name>Emitter` with
   a static method per push event, following `demo.emitter.js` (Flatted
   round-trip, `socketEmitter.of(...).to(...).emit(...)`, try/catch logging
   to `Logger` rather than throwing).
5. Register the namespace in `src/socket-resources/namespaces/index.js`.

If the namespace should require a logged-in user, apply
`namespace.use(authenticationSocketNamespaceMiddleware)` — but remember
that middleware is a stub (see `CLAUDE.md`); don't treat `socket.user` as
verified/active without extending its verify step first.

Run `npm run lint` and `make build` when done and fix any failures. Tell me
the namespace path and the events it handles.
