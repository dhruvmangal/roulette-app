import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ApiClient } from '@roulette/api-client'
import { LocalWalletAdapter, RemoteWalletAdapter, type SocketLike, type StorageLike } from '../src/index.ts'

const memoryStorage = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...initial }
  return { data, getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value } }
}

test('practice chips start at the default and persist on the device', () => {
  const storage = memoryStorage()
  const wallet = new LocalWalletAdapter({ storage })
  assert.equal(wallet.getBalance(), 1000)

  const seen: Array<number | null> = []
  wallet.subscribe(balance => seen.push(balance))
  wallet.set(1250)

  assert.deepEqual(seen, [1250])
  assert.equal(new LocalWalletAdapter({ storage }).getBalance(), 1250)
})

test('a corrupt or missing store falls back to the starting balance', () => {
  assert.equal(new LocalWalletAdapter({ storage: memoryStorage({ 'roulette.practiceChips': 'lots' }) }).getBalance(), 1000)
  assert.equal(new LocalWalletAdapter({ storage: memoryStorage({ 'roulette.practiceChips': '-5' }) }).getBalance(), 1000)
  assert.equal(new LocalWalletAdapter({ storage: null, startingBalance: 500 }).getBalance(), 500)
})

test('the online wallet loads over REST and follows wallet:updated', async () => {
  const handlers = new Map<string, (payload: any) => void>()
  const socket = { on: (event: string, handler: any) => handlers.set(event, handler), off: (event: string) => handlers.delete(event), timeout: () => ({ emit () {} }) } as SocketLike
  const api = { wallet: async () => ({ wallet: { balance: 1100 } }) } as unknown as ApiClient
  const wallet = new RemoteWalletAdapter({ api, socket })

  assert.equal(wallet.getBalance(), null)
  await wallet.refresh()
  assert.equal(wallet.getBalance(), 1100)
  handlers.get('wallet:updated')!({ data: { wallet: { balance: 900 } } })
  assert.equal(wallet.getBalance(), 900)
  wallet.dispose()
  assert.equal(handlers.has('wallet:updated'), false)
})
