import { randomInt } from 'crypto'
import { createTable, findSeat, nextRound, placeBets, playBot, spinTable } from '@roulette/engine'

// The server runs rounds on the shared engine, so offline and online tables follow the same rules.
describe('@roulette/engine on the server', () => {
  const ok = (update) => {
    if (!update.ok) throw new Error(`Refused: ${update.error}`)
    return update.table
  }

  it('plays a full round with the server RNG', () => {
    let table = createTable('AMERICAN', [
      { playerId: 'player-1', name: 'Ana', balance: 1000 },
      { playerId: 'bot-1', name: 'Marcel', balance: 1000, botStyle: 'CAUTIOUS' }
    ])
    table = ok(placeBets(table, 'player-1', [{ type: 'RED', amount: 100 }]))
    table = ok(playBot(table, 'bot-1', randomInt))
    table = ok(spinTable(table, randomInt))

    const { pocket, settlements } = table.result
    const player = findSeat(table, 'player-1')
    expect(player.balance).toBe(900 + settlements['player-1'].totalPayout)
    expect(settlements['player-1'].winningPocket).toBe(pocket)
    expect(settlements['bot-1'].totalStake).toBeGreaterThan(0)

    table = ok(nextRound(table))
    expect(table.round).toBe(2)
    expect(table.phase).toBe('BETTING')
  })

  it('refuses bets once the wheel is spun', () => {
    const table = ok(spinTable(createTable('ENGLISH', [{ playerId: 'p', name: 'P', balance: 10 }]), randomInt))
    expect(placeBets(table, 'p', [{ type: 'RED', amount: 1 }])).toEqual({ ok: false, error: 'BettingClosed' })
  })
})
