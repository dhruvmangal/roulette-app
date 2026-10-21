import ajv from '~/libs/ajv'
import { USERNAME_PATTERN } from '~/utils/constants/player.constants'

/** @type {import("ajv").Schema} Who to ask to be friends, by username. */
const friendRequest = {
  type: 'object',
  properties: { username: { type: 'string', pattern: USERNAME_PATTERN } },
  required: ['username'],
  additionalProperties: false
}

/** @type {import("ajv").Schema} The table to invite a friend to. */
const friendInvite = {
  type: 'object',
  properties: { code: { type: 'string', pattern: '^[A-Za-z0-9]{6}$' } },
  required: ['code'],
  additionalProperties: false
}

ajv.addSchema(friendRequest, '/friendRequest.json')
ajv.addSchema(friendInvite, '/friendInvite.json')
