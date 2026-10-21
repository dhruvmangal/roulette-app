---
description: Scaffold a full REST resource (routes + controller + service(s) + schema), wired into the app the same way the demo resource is.
argument-hint: <resourceName> [fieldName:type ...]
---

Generate a new REST resource named `$ARGUMENTS` (first word is the resource
name, e.g. `product`; any following `field:type` pairs, e.g. `price:number
inStock:boolean`, describe the fields a "create" schema should validate —
default to just `name:string` if none are given).

Follow `CLAUDE.md` exactly. Use `src/services/demo/*`,
`src/rest-resources/controllers/demo.controller.js`,
`src/rest-resources/routes/api/v1/demo.routes.js`, and
`src/json-schemas/demo.schema.js` as the literal templates — same shape,
same middleware order, same import style (`~` alias for cross-folder
imports, relative for same-folder).

Derive names from the resource name (e.g. `product`):
- PascalCase: `Product` → `ProductController`, `GetProductService`, `CreateProductService`
- camelCase: `product`
- kebab-case for the schema id: `/product.json`

Create:

1. `src/services/<name>/get<Name>.service.js` — a `Get<Name>Service` extending
   `ServiceBase`, with a `constraints` schema accepting `limit`/`pageNo`
   query params (copy `getDemo.service.js` verbatim, renaming), querying
   `this.context.dbModels.<Name>` with `findAndCountAll`.
2. `src/services/<name>/create<Name>.service.js` — a `Create<Name>Service`
   extending `ServiceBase`, `constraints` schema built from the given
   `field:type` pairs (all required unless told otherwise), calling
   `<Name>.create(...)`.
3. `src/services/<name>/index.js` — `export * from './get<Name>.service'` /
   `export * from './create<Name>.service'`.
4. `src/rest-resources/controllers/<name>.controller.js` — `<Name>Controller`
   with `get<Name>s` and `create<Name>` static methods, each wrapped in
   `catchAsync`, each calling its service and `sendResponse`.
5. `src/rest-resources/routes/api/v1/<name>.routes.js` — GET `/` and POST `/`
   on an `express.Router({ mergeParams: true })`, with
   `requestValidationMiddleware`/`responseValidationMiddleware` around each,
   an `@openapi` JSDoc block above the router (copy the shape from
   `demo.routes.js`), and a `rateLimiter({...})` on the POST route.
6. `src/json-schemas/<name>.schema.js` — an AJV schema for the create body,
   registered as `ajv.addSchema(schema, '/<name>.json')`.
7. Register the new router in `src/rest-resources/routes/api/v1/index.js`
   (add the import + `v1Router.use('/<name>s', <name>Routes)`).

If the resource needs a DB table, also run `/generate-model <name> <field:type ...>`
(don't invent columns yourself — that command owns the model/migration).

When done: run `npm run lint`, then `npm test`, then `make build`. Fix
anything that fails before reporting done. Tell me the new routes and which
files you created.
