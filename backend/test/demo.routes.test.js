import request from 'supertest'

// Register json-schemas (ajv.addSchema side effects) before the app/routes
// are imported, mirroring the import order in index.js.
import '~/json-schemas'

// Avoid real network connections in unit tests — nothing here needs a live
// Redis, and ioredis's auto-retry would otherwise keep the process (and
// Jest) alive after the tests finish.
jest.mock('~/libs/redisClient', () => ({
  __esModule: true,
  default: {
    connection: {},
    publisherClient: { on: jest.fn(), status: 'ready' },
    subscriberClient: { on: jest.fn(), status: 'ready' },
    client: { call: jest.fn(), status: 'ready' }
  }
}))

// Mock the DB layer so this test doesn't need a real Postgres connection —
// this is the pattern to copy for testing any other service/route.
jest.mock('~/db/models', () => {
  const Demo = {
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [{ demoId: 1, name: 'Example' }], count: 1 }),
    create: jest.fn().mockImplementation(({ name }) => Promise.resolve({ demoId: 2, name }))
  }
  return {
    __esModule: true,
    default: { Demo },
    sequelize: { transaction: jest.fn() }
  }
})

// eslint-disable-next-line import/first
import app from '~/rest-resources'

describe('GET /api/v1/demo', () => {
  it('returns a page of demo records', async () => {
    const res = await request(app).get('/api/v1/demo')

    expect(res.status).toBe(200)
    expect(res.body.errors).toEqual([])
    expect(res.body.data.demos.rows).toHaveLength(1)
  })
})

describe('POST /api/v1/demo', () => {
  it('rejects a request missing the required "name" field', async () => {
    const res = await request(app).post('/api/v1/demo').send({})

    expect(res.status).toBe(400)
    expect(res.body.errors[0].errorCode).toBe(1001) // RequestInputValidationErrorType
  })

  it('creates a demo record', async () => {
    const res = await request(app).post('/api/v1/demo').send({ name: 'test' })

    expect(res.status).toBe(200)
    expect(res.body.data.demo.name).toBe('test')
  })
})

describe('unknown route', () => {
  it('returns a 404 in the standard { data, errors } envelope', async () => {
    const res = await request(app).get('/nope')

    expect(res.status).toBe(404)
    expect(res.body.errors[0].name).toBe('NotFound')
  })
})
