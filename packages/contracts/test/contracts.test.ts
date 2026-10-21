import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLIENT_EVENTS, ERROR_CODES, SERVER_EVENTS } from '../src/index.ts'

test('event names are unique', () => {
  const names = [...Object.values(CLIENT_EVENTS), ...Object.values(SERVER_EVENTS)]
  assert.equal(new Set(names).size, names.length)
})

test('error codes are unique', () => {
  const codes = Object.values(ERROR_CODES)
  assert.equal(new Set(codes).size, codes.length)
})
