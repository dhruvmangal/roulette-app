import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ROUTES, routeForPath, routeForScreen, sitemapPaths } from '../src/routes.ts'

test('every route has a unique path and screen', () => {
  assert.equal(new Set(ROUTES.map(route => route.path)).size, ROUTES.length)
  assert.equal(new Set(ROUTES.map(route => route.screen)).size, ROUTES.length)
})

test('titles and descriptions fit what search results show', () => {
  for (const route of ROUTES) {
    assert.ok(route.title.length <= 65, `${route.path} title is ${route.title.length} characters`)
    assert.ok(route.description.length >= 30 && route.description.length <= 170, `${route.path} description is ${route.description.length} characters`)
  }
})

test('paths match ignoring case and a trailing slash; unknown paths match nothing', () => {
  assert.equal(routeForPath('/')?.screen, 'home')
  assert.equal(routeForPath('/Learn/')?.screen, 'learn')
  assert.equal(routeForPath('/nope'), null)
  assert.equal(routeForPath('/join/ABC123'), null)
  assert.equal(routeForScreen('wallet').path, '/wallet')
})

test('only pages that need no sign-in are in the sitemap', () => {
  assert.deepEqual(sitemapPaths(), ['/', '/learn'])
})
