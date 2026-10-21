import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LOCALES, createTranslator, fill, matchLocale, placeholders, resolveLocale, type Locale, type Messages } from '../src/i18n/core.ts'
import { en } from '../src/i18n/en.ts'
import { es } from '../src/i18n/es.ts'
import { fr } from '../src/i18n/fr.ts'
import { hi } from '../src/i18n/hi.ts'
import { DEFAULT_PREFERENCES, parsePreferences } from '../src/preferencesCore.ts'

const catalogs: Record<Locale, Messages> = { en, hi, es, fr }

test('picks the best supported language from the device list', () => {
  assert.equal(matchLocale(['hi-IN', 'en-US']), 'hi')
  assert.equal(matchLocale(['pt-BR', 'fr-CA', 'en']), 'fr')
  assert.equal(matchLocale(['de', 'ja']), 'en')
  assert.equal(matchLocale([]), 'en')
  assert.equal(resolveLocale('es', ['hi']), 'es')
  assert.equal(resolveLocale('auto', ['hi']), 'hi')
})

test('fills placeholders and leaves unknown ones visible', () => {
  assert.equal(fill('{a} and {b}', { a: 1, b: 'two' }), '1 and two')
  assert.equal(fill('{a} and {b}', { a: 1 }), '1 and {b}')
  assert.equal(fill('no vars'), 'no vars')
})

test('falls back to English, then to the key', () => {
  const catalog = { en: { greet: 'Hello {name}', only: 'English only' }, hi: { greet: 'नमस्ते {name}' }, es: {}, fr: {} } as Record<Locale, Messages>
  assert.equal(createTranslator('hi', catalog)('greet', { name: 'Ana' }), 'नमस्ते Ana')
  assert.equal(createTranslator('hi', catalog)('only'), 'English only')
  assert.equal(createTranslator('hi', catalog)('missing.key'), 'missing.key')
})

test('chooses plural forms by the language\'s own rules', () => {
  const catalog = {
    en: { 'n.friends_one': '{count} friend', 'n.friends_other': '{count} friends' },
    fr: { 'n.friends_one': '{count} ami', 'n.friends_other': '{count} amis' },
    hi: {}, es: {}
  } as Record<Locale, Messages>
  const english = createTranslator('en', catalog)
  assert.equal(english('n.friends', { count: 1 }), '1 friend')
  assert.equal(english('n.friends', { count: 0 }), '0 friends')
  assert.equal(english('n.friends', { count: 5 }), '5 friends')
  // French counts 0 as singular, English does not.
  assert.equal(createTranslator('fr', catalog)('n.friends', { count: 0 }), '0 ami')
})

test('every translation is for a real English key and keeps its placeholders', () => {
  for (const { id } of LOCALES) {
    for (const [key, message] of Object.entries(catalogs[id])) {
      assert.ok(key in en || key.replace(/_(zero|one|two|few|many|other)$/, '_other') in en, `${id}: "${key}" is not an English key`)
      const source = (en as Messages)[key] ?? (en as Messages)[key.replace(/_(zero|one|two|few|many)$/, '_other')]
      assert.deepEqual(placeholders(message), placeholders(source), `${id}: "${key}" uses different {placeholders} than English`)
    }
  }
})

test('plural messages always have an _other form', () => {
  for (const { id } of LOCALES) {
    for (const key of Object.keys(catalogs[id])) {
      const base = key.match(/^(.*)_(zero|one|two|few|many)$/)?.[1]
      if (base) assert.ok(`${base}_other` in catalogs[id] || `${base}_other` in en, `${id}: "${base}" has _${key.split('_').pop()} but no _other`)
    }
  }
})

test('each non-English language covers the keys it should', () => {
  const keys = Object.keys(en)
  for (const id of ['hi', 'es', 'fr'] as const) {
    const missing = keys.filter(key => !(key in catalogs[id]))
    assert.deepEqual(missing, [], `${id} is missing ${missing.length} of ${keys.length} messages`)
  }
})

test('reads saved preferences, ignoring anything invalid', () => {
  assert.deepEqual(parsePreferences(null), DEFAULT_PREFERENCES)
  assert.deepEqual(parsePreferences('not json'), DEFAULT_PREFERENCES)
  assert.deepEqual(parsePreferences('{"volume": 5, "language": "klingon", "effects": "yes", "voiceVolume": -1}'), { ...DEFAULT_PREFERENCES, volume: 1, voiceVolume: 0 })
  assert.equal(parsePreferences('{"language":"hi","volume":0.25}').language, 'hi')
  assert.equal(parsePreferences('{"volume":0.25}').volume, 0.25)
})

test('keeps the old dealer-voice switch until preferences are saved', () => {
  assert.equal(parsePreferences(null, true).voice, false)
  assert.equal(parsePreferences('{"voice":true}', true).voice, true)
})
