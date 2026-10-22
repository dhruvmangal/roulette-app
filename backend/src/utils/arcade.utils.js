import { randomInt } from 'crypto'

/** The server's source of chance: the OS's secure generator. */
export const secureRandomInt = (max) => randomInt(max)

/** The round as a client sees it. A flight still in the air keeps its crash point to itself. */
export function toArcadeRoundView (round, now = new Date()) {
  const { arcadeRoundId, game, status, stake, payout, outcome, startedAt, settledAt } = round
  const view = {
    arcadeRoundId,
    game,
    status,
    stake,
    payout,
    outcome,
    startedAt: new Date(startedAt).toISOString(),
    settledAt: settledAt ? new Date(settledAt).toISOString() : null
  }
  if (status === 'ACTIVE') {
    const { crashPoint, ...visible } = outcome
    view.outcome = visible
    view.elapsedMs = Math.max(0, now.getTime() - new Date(startedAt).getTime())
  }
  return view
}
