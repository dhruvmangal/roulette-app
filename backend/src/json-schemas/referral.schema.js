import ajv from '~/libs/ajv'

/** @type {import("ajv").Schema} A friend's referral code, typed or from a link. */
const claimReferral = {
  type: 'object',
  properties: {
    code: { type: 'string', pattern: '^[A-Za-z0-9 -]{4,16}$' }
  },
  required: ['code']
}

ajv.addSchema(claimReferral, '/claimReferral.json')
