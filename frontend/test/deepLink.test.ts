import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDeepLink, withoutDeepLink } from '../src/deepLink.ts'

test('reads the links people share', () => {
  assert.deepEqual(parseDeepLink('https://play.example.com/join/ab12cd'), { kind: 'join', code: 'AB12CD' })
  assert.deepEqual(parseDeepLink('https://play.example.com/join/AB12CD/'), { kind: 'join', code: 'AB12CD' })
  assert.deepEqual(parseDeepLink('https://play.example.com/r/k7qm2xa'), { kind: 'ref', code: 'K7QM2XA' })
})

test('reads what a shared link forwards to', () => {
  assert.deepEqual(parseDeepLink('http://localhost/?join=AB12CD'), { kind: 'join', code: 'AB12CD' })
  assert.deepEqual(parseDeepLink('http://localhost/?ref=K7QM2XA&utm=x'), { kind: 'ref', code: 'K7QM2XA' })
})

test('reads the app scheme', () => {
  assert.deepEqual(parseDeepLink('roulette://join/AB12CD'), { kind: 'join', code: 'AB12CD' })
  assert.deepEqual(parseDeepLink('roulette://r/K7QM2XA'), { kind: 'ref', code: 'K7QM2XA' })
  assert.deepEqual(parseDeepLink('roulette:///r/K7QM2XA'), { kind: 'ref', code: 'K7QM2XA' })
  assert.deepEqual(parseDeepLink('roulette://?ref=K7QM2XA'), { kind: 'ref', code: 'K7QM2XA' })
})

test('ignores everything else, including codes of the wrong shape', () => {
  for (const link of [
    '', 'not a url', 'https://play.example.com/', 'https://play.example.com/admin/players',
    'https://play.example.com/join/AB12C', 'https://play.example.com/join/AB12CDE', // table codes are 6
    'https://play.example.com/r/K7QM2X', 'https://play.example.com/r/K7QM2XAB', // referral codes are 7
    'https://play.example.com/r/K7QM2XA/extra', 'https://play.example.com/join/AB12CD/extra',
    'roulette://other/AB12CD', 'https://play.example.com/?ref=<script>', 'https://play.example.com/x/join/AB12CD'
  ]) assert.equal(parseDeepLink(link), null, link)
})

test('takes a handled link out of the address', () => {
  assert.equal(withoutDeepLink('https://play.example.com/join/AB12CD'), '/')
  assert.equal(withoutDeepLink('https://play.example.com/r/K7QM2XA?x=1#top'), '/?x=1#top')
  assert.equal(withoutDeepLink('http://localhost/?ref=K7QM2XA'), '/')
  assert.equal(withoutDeepLink('http://localhost/?join=AB12CD&x=1'), '/?x=1')
})
