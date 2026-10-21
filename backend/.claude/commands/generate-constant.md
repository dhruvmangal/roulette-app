---
description: Add a new constant, error type, or success message — in the right existing file, or a new one if the topic doesn't fit any existing file.
argument-hint: <errors|success|socket|new-file-name> <KEY=value ...>
---

Add constant(s) described by `$ARGUMENTS`.

First decide where they belong:
- A new **error type** → `src/utils/constants/errors.js`. Add a
  `PascalCaseErrorType` object with `name`, `statusCode` (from
  `http-status-codes`), `isOperational: true` (unless it truly represents
  an unexpected/internal failure), a human `description`, and a unique
  `errorCode` — read the file first and pick the next unused number, don't
  guess or reuse one. If the description needs a distinct user-facing
  string, add it to `src/locals/en-US.json` under the same key as `name`.
- A new **success message** → `src/utils/constants/success.js`, added to
  the `SUCCESS_MSG` object.
- A new **socket namespace/room/emitter name** → `src/utils/constants/socket.js`
  (this is normally handled by `/generate-socket` — only add here directly
  for a one-off addition to an existing namespace).
- Anything else that's a genuinely new category (feature flags, external
  API constants, enums for a new domain) → a new file
  `src/utils/constants/<topic>.constants.js` exporting a plain object.
  Don't cram unrelated constants into an existing file just because one
  exists — but also don't create a new file for one value that clearly
  belongs in `errors.js`/`success.js`.

Naming: `CAPITAL_SNAKE_CASE` for constant keys, `PascalCase` for error type
object names, per `coding-guide.md`. Never hardcode a magic string/number
in a service/controller/middleware that should instead reference one of
these files — if you find yourself about to do that while implementing
something else, that's also a sign to run this command first.

Run `npm run lint` when done.
