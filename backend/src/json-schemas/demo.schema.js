import ajv from '~/libs/ajv'

/** @type {import("ajv").Schema} */
const demo = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 }
  },
  required: ['name']
}

ajv.addSchema(demo, '/demo.json')
