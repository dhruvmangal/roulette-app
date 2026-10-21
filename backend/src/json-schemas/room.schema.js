import ajv from '~/libs/ajv'
import { ROOM_LIMITS, ROOM_MODES, VARIANTS } from '~/utils/constants/game.constants'

const between = ({ min, max }) => ({ type: 'integer', minimum: min, maximum: max })

/** @type {import("ajv").Schema} */
const createRoom = {
  type: 'object',
  properties: {
    variant: { enum: VARIANTS },
    // Public tables are opened by quick match, not by players.
    mode: { enum: [ROOM_MODES.VS_COMPUTER, ROOM_MODES.PRIVATE] },
    bots: between(ROOM_LIMITS.bots),
    totalRounds: { anyOf: [between(ROOM_LIMITS.totalRounds), { type: 'null' }] },
    bettingSeconds: between(ROOM_LIMITS.bettingSeconds),
    minBet: between(ROOM_LIMITS.minBet),
    maxBet: between(ROOM_LIMITS.maxBet)
  },
  required: ['variant', 'mode']
}

/** @type {import("ajv").Schema} */
const quickMatch = {
  type: 'object',
  properties: { variant: { enum: VARIANTS } },
  required: ['variant']
}

/** @type {import("ajv").Schema} */
const joinRoom = {
  type: 'object',
  properties: { code: { type: 'string', pattern: '^[A-Z0-9]{6}$' } },
  required: ['code']
}

ajv.addSchema(createRoom, '/createRoom.json')
ajv.addSchema(quickMatch, '/quickMatch.json')
ajv.addSchema(joinRoom, '/joinRoom.json')
ajv.addSchema({
  type: 'object',
  properties: { instanceId: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,128}$' }, variant: { enum: VARIANTS } },
  required: ['instanceId']
}, '/joinDiscordTable.json')
