---
description: Add a single service (business-logic unit) to an existing resource, without touching routes/controllers.
argument-hint: <resourceName> <serviceVerb> [fieldName:type ...]
---

Add one new service to an existing resource. `$ARGUMENTS` gives the
resource name, the verb/action for the service (e.g. `resource=order
verb=cancel`), and optionally `field:type` pairs describing its expected
input.

Use `src/services/demo/getDemo.service.js` and `createDemo.service.js` as
the templates for shape (extends `ServiceBase`, `get constraints()` returns
a compiled AJV schema, `async run()` holds the logic, reads
`this.context.dbModels` for DB access, returns a plain object with a
`message` key from `~/utils/constants/success`, reports business-rule
failures via `this.addError('PascalCaseKey', 'message')` rather than
throwing).

Steps:
1. Determine the resource's service folder: `src/services/<resource>/`. If
   it doesn't exist yet, this is really a job for `/generate-resource`
   first — ask before creating a services folder with no controller/route
   wired to it.
2. Create `src/services/<resource>/<verb><Resource>.service.js` exporting
   `<Verb><Resource>Service` (PascalCase), following the template above.
3. Add `export * from './<verb><Resource>.service'` to
   `src/services/<resource>/index.js`.
4. If a controller for this resource already exists
   (`src/rest-resources/controllers/<resource>.controller.js`), add a
   `catchAsync`-wrapped static method calling the new service via
   `.execute(...)` and `sendResponse`, and wire it into the resource's
   route file with the standard `requestValidationMiddleware` /
   `responseValidationMiddleware` pair. If no controller/route exists, just
   create the service and say so — don't invent a route ad hoc.
5. If the service needs a new error type, add it to
   `src/utils/constants/errors.js` with a unique `errorCode` (check the
   existing file for the highest one in use and increment) rather than
   reusing an unrelated one.

Run `npm run lint` and `npm test` when done and fix any failures.
