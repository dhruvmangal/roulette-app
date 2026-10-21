import { WHAT_IFS, houseEdge, replayWithAlternatives, safeTimeZone, shareBeaten, summarizeStreaks } from '~/utils/stats.utils'

describe('houseEdge', () => {
  it('is 1/37 on every bet on a single-zero wheel', () => {
    for (const type of ['STRAIGHT', 'SPLIT', 'STREET', 'CORNER', 'SIX_LINE', 'DOZEN', 'COLUMN', 'RED', 'HIGH']) {
      expect(houseEdge('ENGLISH', type)).toBeCloseTo(1 / 37)
    }
  })

  it('is 2/38 on an American wheel, and 3/38 on the top line', () => {
    expect(houseEdge('AMERICAN', 'STRAIGHT')).toBeCloseTo(2 / 38)
    expect(houseEdge('AMERICAN', 'BLACK')).toBeCloseTo(2 / 38)
    expect(houseEdge('AMERICAN', 'TOP_LINE')).toBeCloseTo(3 / 38)
  })
})

describe('safeTimeZone', () => {
  it('keeps a real timezone and falls back to UTC otherwise', () => {
    expect(safeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
    expect(safeTimeZone('Mars/Olympus')).toBe('UTC')
    expect(safeTimeZone(null)).toBe('UTC')
  })
})

describe('summarizeStreaks', () => {
  const at = (minute) => new Date(Date.UTC(2026, 9, 20, 12, minute)).toISOString()

  it('finds the longest runs and the one the player is on now', () => {
    const runs = [
      { sign: 1, length: 4, endedAt: at(4) },
      { sign: -1, length: 2, endedAt: at(6) },
      { sign: 0, length: 1, endedAt: at(7) },
      { sign: -1, length: 5, endedAt: at(12) },
      { sign: 1, length: 2, endedAt: at(14) }
    ]
    expect(summarizeStreaks(runs)).toEqual({ longestWin: 4, longestLoss: 5, current: { kind: 'WIN', length: 2 } })
  })

  it('has no current streak after an even round or before any round', () => {
    expect(summarizeStreaks([{ sign: 0, length: 1, endedAt: at(1) }]).current).toBeNull()
    expect(summarizeStreaks([])).toEqual({ longestWin: 0, longestLoss: 0, current: null })
  })
})

describe('replayWithAlternatives', () => {
  const net = (rounds, what) => replayWithAlternatives(rounds).find(row => row.what === what).net

  it('replays the same stakes on the same spins with the real payouts', () => {
    // 1 is red and in the first dozen, 2 is black and in the first dozen, 0 is green.
    const rounds = [
      { variant: 'ENGLISH', winningPocket: '1', staked: 100 },
      { variant: 'ENGLISH', winningPocket: '2', staked: 100 },
      { variant: 'ENGLISH', winningPocket: '0', staked: 100 }
    ]
    expect(replayWithAlternatives(rounds).map(row => row.what)).toEqual(WHAT_IFS)
    expect(net(rounds, 'ALWAYS_RED')).toBe(100 - 100 - 100)
    // Half on each colour wins back its stake on both colours and loses only on the zero.
    expect(net(rounds, 'RED_AND_BLACK')).toBe(-100)
    expect(net(rounds, 'FIRST_DOZEN')).toBe(200 + 200 - 100)
  })

  it('treats the American double zero as a loss too', () => {
    expect(net([{ variant: 'AMERICAN', winningPocket: '00', staked: 50 }], 'RED_AND_BLACK')).toBe(-50)
  })

  it('splits an odd stake without losing a chip, and skips rounds with nothing staked', () => {
    // 25 chips: 12 on red and 13 on black. Red comes up: +12 - 13.
    expect(net([{ variant: 'ENGLISH', winningPocket: '1', staked: 25 }], 'RED_AND_BLACK')).toBe(-1)
    expect(net([{ variant: 'ENGLISH', winningPocket: '1', staked: 0 }], 'ALWAYS_RED')).toBe(0)
    expect(net([], 'ALWAYS_RED')).toBe(0)
  })

  it('over many spins no alternative beats the house edge', () => {
    // Every pocket once, European, 1 chip each: red loses to the single zero.
    const everyPocket = Array.from({ length: 37 }, (_, i) => ({ variant: 'ENGLISH', winningPocket: String(i), staked: 100 }))
    expect(net(everyPocket, 'ALWAYS_RED')).toBe(-100)
    expect(net(everyPocket, 'FIRST_DOZEN')).toBe(-100)
    expect(net(everyPocket, 'RED_AND_BLACK')).toBe(-100)
  })
})

describe('shareBeaten', () => {
  it('is the share of the other players this one did better than', () => {
    expect(shareBeaten(10, [1, 2, 3, 20])).toBe(0.75)
    expect(shareBeaten(0, [1, 2])).toBe(0)
    expect(shareBeaten(5, [5, 5])).toBe(0)
    expect(shareBeaten(5, [])).toBeNull()
  })
})
