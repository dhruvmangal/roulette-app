const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const TYPE_TO_JSON_SCHEMA = {
  string: 'string',
  text: 'string',
  integer: 'number',
  decimal: 'number',
  boolean: 'boolean',
  date: 'string',
  json: 'object',
  uuid: 'string'
}

const STATUS_CODE_KEYS = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR'
}

/** "price:decimal,inStock:boolean" -> [{ name: 'price', type: 'decimal' }, ...] */
function parseFields (fieldsInput, fallback = 'name:string') {
  const raw = (fieldsInput && fieldsInput.trim()) || fallback
  return raw
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [name, type = 'string'] = pair.split(':').map((s) => s.trim())
      const normalizedType = type.toLowerCase()
      if (!TYPE_TO_JSON_SCHEMA[normalizedType]) {
        throw new Error(
          `Unknown field type "${type}" for field "${name}". Use one of: ${Object.keys(TYPE_TO_JSON_SCHEMA).join(', ')}`
        )
      }
      return { name, type: normalizedType }
    })
}

/** "created,cancelled" -> ['created', 'cancelled'] */
function parseList (input, fallback = 'ping') {
  const raw = (input && input.trim()) || fallback
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

/** "KEY=value,OTHER=thing" -> [{ key: 'KEY', value: 'value' }, ...] */
function parseEntries (input) {
  return (input || '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [key, ...rest] = pair.split('=')
      return { key: key.trim(), value: rest.join('=').trim() }
    })
}

/**
 * Insert one or more `  key: value` lines into an existing flat object
 * export (`export const NAME = { ... }`) right before its closing brace,
 * fixing up the trailing comma on whatever the current last entry is.
 * Safe to call repeatedly — it never depends on what the last entry was.
 */
function insertIntoObjectExport (filePath, exportName, newLines) {
  const absPath = path.resolve(__dirname, filePath)
  const content = fs.readFileSync(absPath, 'utf8')

  const startMarker = `export const ${exportName} = {`
  const startIndex = content.indexOf(startMarker)
  if (startIndex === -1) {
    throw new Error(`Could not find "${startMarker}" in ${filePath}`)
  }

  const openBraceIndex = startIndex + startMarker.length - 1
  const closeBraceIndex = content.indexOf('\n}', openBraceIndex)
  if (closeBraceIndex === -1) {
    throw new Error(`Could not find the closing brace for ${exportName} in ${filePath}`)
  }

  let body = content.slice(openBraceIndex + 1, closeBraceIndex)

  // Ensure the current last entry ends with a comma before we append ours.
  body = body.replace(/([^\s,{])\s*$/, '$1,')

  const additions = newLines.map((line, i) => `  ${line}${i < newLines.length - 1 ? ',' : ''}`).join('\n')
  const newBody = `${body}\n${additions}\n`

  const newContent = content.slice(0, openBraceIndex + 1) + newBody + content.slice(closeBraceIndex + 1)
  fs.writeFileSync(absPath, newContent)
  return `updated ${filePath} (${exportName})`
}

/** Scan utils/constants/errors.js for the highest `errorCode: N` in use. */
function nextErrorCode (filePath) {
  const absPath = path.resolve(__dirname, filePath)
  const content = fs.readFileSync(absPath, 'utf8')
  const codes = [...content.matchAll(/errorCode:\s*(\d+)/g)].map((m) => Number(m[1]))
  return codes.length ? Math.max(...codes) + 1 : 1000
}

function timestamp () {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

module.exports = function (plop) {
  plop.setHelper('jsonType', (type) => TYPE_TO_JSON_SCHEMA[type] || 'string')
  plop.setHelper('statusCodeKey', (code) => STATUS_CODE_KEYS[Number(code)] || 'BAD_REQUEST')

  // -------------------------------------------------------------------------
  // resource — full REST resource: services + controller + route + schema
  // -------------------------------------------------------------------------
  plop.setGenerator('resource', {
    description: 'Full REST resource: services, controller, route, schema — wired into the v1 router',
    prompts: [
      { type: 'input', name: 'name', message: 'Resource name (singular, e.g. "product"):' },
      { type: 'input', name: 'fields', message: 'Fields for the create schema, as name:type,name:type (types: string, text, integer, decimal, boolean, date, json, uuid):', default: 'name:string' }
    ],
    actions: (data) => {
      data.parsedFields = parseFields(data.fields)

      return [
        {
          type: 'add',
          path: 'src/services/{{camelCase name}}/get{{pascalCase name}}.service.js',
          templateFile: 'plop-templates/get-service.hbs'
        },
        {
          type: 'add',
          path: 'src/services/{{camelCase name}}/create{{pascalCase name}}.service.js',
          templateFile: 'plop-templates/create-service.hbs'
        },
        {
          type: 'add',
          path: 'src/services/{{camelCase name}}/index.js',
          templateFile: 'plop-templates/service-index.hbs'
        },
        {
          type: 'add',
          path: 'src/rest-resources/controllers/{{camelCase name}}.controller.js',
          templateFile: 'plop-templates/controller.hbs'
        },
        {
          type: 'add',
          path: 'src/rest-resources/routes/api/v1/{{camelCase name}}.routes.js',
          templateFile: 'plop-templates/routes.hbs'
        },
        {
          type: 'add',
          path: 'src/json-schemas/{{camelCase name}}.schema.js',
          templateFile: 'plop-templates/schema.hbs'
        },
        {
          type: 'modify',
          path: 'src/rest-resources/routes/api/v1/index.js',
          pattern: /(import demoRoutes from '\.\/demo\.routes'\n)/,
          template: "$1import {{camelCase name}}Routes from './{{camelCase name}}.routes'\n"
        },
        {
          type: 'modify',
          path: 'src/rest-resources/routes/api/v1/index.js',
          pattern: /(v1Router\.use\('\/demo', demoRoutes\)\n)/,
          template: "$1v1Router.use('/{{kebabCase name}}s', {{camelCase name}}Routes)\n"
        }
      ]
    }
  })

  // -------------------------------------------------------------------------
  // service — add one service to an existing resource
  // -------------------------------------------------------------------------
  plop.setGenerator('service', {
    description: 'Add one service to an existing resource (run `resource` first if the resource does not exist yet)',
    prompts: [
      { type: 'input', name: 'resource', message: 'Existing resource name (e.g. "product"):' },
      { type: 'input', name: 'verb', message: 'Action name for this service (e.g. "cancel", "archive"):' },
      { type: 'input', name: 'fields', message: 'Input fields, as name:type,name:type (blank for none):', default: '' }
    ],
    actions: (data) => {
      const indexPath = path.join(__dirname, 'src', 'services', data.resource, 'index.js')
      if (!fs.existsSync(indexPath)) {
        throw new Error(
          `src/services/${data.resource}/ doesn't exist yet. Run "npm run generate resource" for "${data.resource}" first.`
        )
      }

      data.parsedFields = data.fields ? parseFields(data.fields) : []

      return [
        {
          type: 'add',
          path: 'src/services/{{camelCase resource}}/{{camelCase verb}}{{pascalCase resource}}.service.js',
          templateFile: 'plop-templates/action-service.hbs'
        },
        {
          type: 'append',
          path: 'src/services/{{camelCase resource}}/index.js',
          template: "export * from './{{camelCase verb}}{{pascalCase resource}}.service'\n"
        }
      ]
    }
  })

  // -------------------------------------------------------------------------
  // socket — namespace + handler + emitter
  // -------------------------------------------------------------------------
  plop.setGenerator('socket', {
    description: 'Full socket namespace: handler, namespace, emitter — wired into the socket server',
    prompts: [
      { type: 'input', name: 'name', message: 'Namespace name (e.g. "chat"):' },
      { type: 'input', name: 'events', message: 'Event names, comma-separated (e.g. "message,typing"):', default: 'ping' }
    ],
    actions: (data) => {
      data.eventList = parseList(data.events)

      return [
        {
          type: 'add',
          path: 'src/socket-resources/handlers/{{camelCase name}}.handler.js',
          templateFile: 'plop-templates/socket-handler.hbs'
        },
        {
          type: 'add',
          path: 'src/socket-resources/namespaces/{{camelCase name}}.namespace.js',
          templateFile: 'plop-templates/socket-namespace.hbs'
        },
        {
          type: 'add',
          path: 'src/socket-resources/emitters/{{camelCase name}}.emitter.js',
          templateFile: 'plop-templates/socket-emitter.hbs'
        },
        {
          type: 'modify',
          path: 'src/socket-resources/namespaces/index.js',
          pattern: /(import demoNamespace from '\.\/demo\.namespace'\n)/,
          template: "$1import {{camelCase name}}Namespace from './{{camelCase name}}.namespace'\n"
        },
        {
          type: 'modify',
          path: 'src/socket-resources/namespaces/index.js',
          pattern: /( {2}demoNamespace\(io\)\n)/,
          template: '$1  {{camelCase name}}Namespace(io)\n'
        },
        (renderedData) => insertIntoObjectExport(
          'src/utils/constants/socket.js',
          'SOCKET_NAMESPACES',
          [`${plop.getHelper('constantCase')(renderedData.name)}: '/${plop.getHelper('kebabCase')(renderedData.name)}'`]
        ),
        (renderedData) => insertIntoObjectExport(
          'src/utils/constants/socket.js',
          'SOCKET_ROOMS',
          [`${plop.getHelper('constantCase')(renderedData.name)}_ROOM: '${plop.getHelper('constantCase')(renderedData.name)}_ROOM'`]
        ),
        (renderedData) => insertIntoObjectExport(
          'src/utils/constants/socket.js',
          'SOCKET_EMITTERS',
          renderedData.eventList.map((event) => {
            const key = `${plop.getHelper('constantCase')(renderedData.name)}_${plop.getHelper('constantCase')(event)}`
            return `${key}: '${key}'`
          })
        )
      ]
    }
  })

  // -------------------------------------------------------------------------
  // model — Sequelize model + migration (+ optional seeder)
  // -------------------------------------------------------------------------
  plop.setGenerator('model', {
    description: 'Sequelize model + migration (+ optional seeder)',
    prompts: [
      { type: 'input', name: 'name', message: 'Model name (singular, e.g. "order"):' },
      { type: 'input', name: 'fields', message: 'Fields beyond id/timestamps, as name:type,name:type:', default: 'name:string' },
      { type: 'confirm', name: 'withSeeder', message: 'Also generate a seeder with a blank sample row?', default: false }
    ],
    actions: (data) => {
      data.parsedFields = parseFields(data.fields)
      data.timestamp = timestamp()

      const actions = [
        {
          type: 'add',
          path: 'src/db/models/{{camelCase name}}.js',
          templateFile: 'plop-templates/model.hbs'
        },
        {
          type: 'add',
          path: 'src/db/migrations/{{timestamp}}-create-{{camelCase name}}s.migration.js',
          templateFile: 'plop-templates/migration.hbs'
        }
      ]

      if (data.withSeeder) {
        actions.push({
          type: 'add',
          path: 'src/db/seeders/{{timestamp}}-{{camelCase name}}-seed.seeder.js',
          templateFile: 'plop-templates/seeder.hbs'
        })
      }

      actions.push(() => 'Remember to run: npm run sequelize db:migrate' + (data.withSeeder ? ' && npm run sequelize db:seed:all' : ''))

      return actions
    }
  })

  // -------------------------------------------------------------------------
  // constant — error type / success message / new constants file
  // -------------------------------------------------------------------------
  plop.setGenerator('constant', {
    description: 'Add an error type, a success message, or a whole new constants file',
    prompts: [
      {
        type: 'list',
        name: 'kind',
        message: 'What kind of constant?',
        choices: [
          { name: 'Error type (utils/constants/errors.js)', value: 'error' },
          { name: 'Success message (utils/constants/success.js)', value: 'success' },
          { name: 'New constants file (a whole new topic)', value: 'custom' }
        ]
      },
      { type: 'input', name: 'name', message: 'Error name, PascalCase (e.g. "OrderNotFound"):', when: (a) => a.kind === 'error' },
      { type: 'input', name: 'statusCode', message: 'HTTP status code (e.g. 404):', default: '400', when: (a) => a.kind === 'error' },
      { type: 'input', name: 'description', message: 'User-facing description:', when: (a) => a.kind === 'error' },
      { type: 'confirm', name: 'isOperational', message: 'Is this an expected/operational error (vs. an unexpected server bug)?', default: true, when: (a) => a.kind === 'error' },

      { type: 'input', name: 'key', message: 'Constant key, CONSTANT_CASE (e.g. "ORDER_SHIPPED"):', when: (a) => a.kind === 'success' },
      { type: 'input', name: 'message', message: 'Message text:', when: (a) => a.kind === 'success' },

      { type: 'input', name: 'topic', message: 'Topic / file name (e.g. "feature-flags"):', when: (a) => a.kind === 'custom' },
      { type: 'input', name: 'entries', message: 'Entries as KEY=value,KEY2=value2:', when: (a) => a.kind === 'custom' }
    ],
    actions: (data) => {
      if (data.kind === 'error') {
        data.errorCode = nextErrorCode('src/utils/constants/errors.js')
        return [
          {
            type: 'append',
            path: 'src/utils/constants/errors.js',
            templateFile: 'plop-templates/error-constant.hbs'
          }
        ]
      }

      if (data.kind === 'success') {
        return [
          (renderedData) => insertIntoObjectExport(
            'src/utils/constants/success.js',
            'SUCCESS_MSG',
            [`${plop.getHelper('constantCase')(renderedData.key)}: '${renderedData.message}'`]
          )
        ]
      }

      // custom
      data.parsedEntries = parseEntries(data.entries)
      return [
        {
          type: 'add',
          path: 'src/utils/constants/{{kebabCase topic}}.constants.js',
          templateFile: 'plop-templates/custom-constants-file.hbs'
        }
      ]
    }
  })
}
