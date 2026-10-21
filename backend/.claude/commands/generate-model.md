---
description: Scaffold a Sequelize model + migration + seeder, following the demo model's conventions.
argument-hint: <modelName> [fieldName:type ...]
---

Generate a new Sequelize model named `$ARGUMENTS` (first word is the
singular model name, e.g. `order`; any following `field:type` pairs
describe its columns beyond the standard `id`/timestamps, e.g.
`total:decimal status:string userId:integer`).

Use `src/db/models/demo.js` and
`src/db/migrations/20260101000000-create-demos.migration.js` as the literal
templates.

Type mapping (Sequelize DataTypes ↔ migration Sequelize types):
`string`→`STRING`, `text`→`TEXT`, `integer`→`INTEGER`, `decimal`→`DECIMAL`,
`boolean`→`BOOLEAN`, `date`→`DATE`, `json`→`JSONB`, `uuid`→`UUID`. A field
named `<other><Model>Id` (e.g. `userId` on an `order` model) is a foreign
key — add `references: { model: '<other>s', key: '<other>_id' }` in the
migration and mention the association as a commented-out
`Order.belongsTo(models.User, ...)` line in the model's `associate` hook,
matching the commented example already in `demo.js`.

Create:

1. `src/db/models/<name>.js` — singular model name (`sequelize.define('<Name>', ...)`),
   camelCase attribute keys, `tableName: '<name>s'`, `underscored: true`,
   `timestamps: true`, an autoincrement `<name>Id` primary key, then the
   given fields.
2. `src/db/migrations/<YYYYMMDDHHMMSS>-create-<name>s.migration.js` —
   `queryInterface.createTable('<name>s', {...})` with smallcase
   `snake_case` column names matching the model's `underscored` mapping,
   plus `created_at`/`updated_at`. Use the actual current UTC timestamp for
   the filename prefix (run `date -u +%Y%m%d%H%M%S` — don't reuse
   `20260101000000`, that's the demo's placeholder and migrations must sort
   in creation order).
3. `src/db/seeders/<timestamp>-<name>-seed.seeder.js` — one plausible sample
   row, only if asked for seed data; otherwise skip this file.

Do not add associations, indexes, or `associate` logic beyond what the
given fields imply — leave a commented example if it's ambiguous, and ask
rather than guessing at real foreign-key relationships.

After creating the files, remind me to run
`npm run sequelize db:migrate` (and `db:seed:all` if a seeder was created) —
don't run it yourself unless I confirm a database is actually reachable
right now.
