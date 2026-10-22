import { ARCADE_LIMITS } from '@roulette/engine'
import ajv from '~/libs/ajv'

const stake = { type: 'integer', minimum: ARCADE_LIMITS.minBet, maximum: ARCADE_LIMITS.maxBet }
const requestId = { type: 'string', minLength: 1, maxLength: 64 }
const risk = { enum: ['low', 'medium', 'high'] }

/** @type {import("ajv").Schema} One drop of the plinko ball. */
const playPlinko = {
  type: 'object',
  properties: { stake, rows: { type: 'integer', minimum: 8, maximum: 16 }, risk, requestId },
  required: ['stake', 'rows', 'risk', 'requestId']
}

/** @type {import("ajv").Schema} One spin of the prize wheel. */
const playWheel = {
  type: 'object',
  properties: { stake, risk, requestId },
  required: ['stake', 'risk', 'requestId']
}

/** @type {import("ajv").Schema} A race, with a stake on each horse the player backs. */
const playHorses = {
  type: 'object',
  properties: {
    bets: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: {
        type: 'object',
        properties: { horse: { type: 'integer', minimum: 0, maximum: 5 }, stake },
        required: ['horse', 'stake']
      }
    },
    requestId
  },
  required: ['bets', 'requestId']
}

/** @type {import("ajv").Schema} A flight: one or two bets. */
const startCrash = {
  type: 'object',
  properties: {
    game: { enum: ['AVIATOR'] },
    bets: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          stake,
          autoCashout: { anyOf: [{ type: 'number', minimum: 1.01, maximum: 1000 }, { type: 'null' }] }
        },
        required: ['stake']
      }
    },
    requestId
  },
  required: ['game', 'bets', 'requestId']
}

/** @type {import("ajv").Schema} Cash a bet out of a flight now. */
const cashOutCrash = {
  type: 'object',
  properties: { slot: { type: 'integer', minimum: 0, maximum: 1 } },
  required: ['slot']
}

ajv.addSchema(playPlinko, '/playPlinko.json')
ajv.addSchema(playWheel, '/playWheel.json')
ajv.addSchema(playHorses, '/playHorses.json')
ajv.addSchema(startCrash, '/startCrash.json')
ajv.addSchema(cashOutCrash, '/cashOutCrash.json')
