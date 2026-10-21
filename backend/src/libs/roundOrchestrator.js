import { randomInt, randomUUID } from 'crypto'
import Redis from 'ioredis'
import { QueryTypes } from 'sequelize'
import config from '~/configs/app.config'
import models, { sequelize } from '~/db/models'
import Logger from '~/libs/logger'
import redisClient from '~/libs/redisClient'
import {
  CloseBettingService, EndRoomService, LeaveRoomService, OpenRoundService, PlaceBotBetsService, SetPresenceService,
  SettleRoundService, SpinRoundService
} from '~/services/game'
import socketServer from '~/socket-resources'
import RouletteEmitter from '~/socket-resources/emitters/roulette.emitter'
import {
  AWAY_CHECK_INTERVAL_MS, AWAY_CHECK_LOCK, IDLE_RECHECK_MS, ROOM_WAKE_CHANNEL, ROUND_STATUS, RUNNER_LOCK_TTL_MS,
  RUNNER_SWEEP_INTERVAL_MS
} from '~/utils/constants/game.constants'
import { SOCKET_NAMESPACES, SOCKET_ROOMS } from '~/utils/constants/socket'
import { ROOM_ACTIONS, nextRoomAction } from '~/utils/game.utils'

const RETRY_MS = 1000
const TICK_MS = 1000
// Bots bet somewhere in the first 60% of the betting window, a second or more in.
const BOT_FIRST_MS = 1000
const BOT_WINDOW_SHARE = 0.6

const RENEW_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end"
const RELEASE_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"

const lockKey = (roomId) => `roulette:room:${roomId}:runner`

/**
 * Runs every active table's rounds on this server: BETTING → BETS_CLOSED →
 * SPINNING → RESULT → next round, with bots taking their turns.
 *
 * Rounds are only dealt while a seated player is connected to the table; a
 * room nobody is watching goes idle until someone returns. Players gone longer
 * than game.awayUnseatSeconds lose their seat.
 *
 * Each room is run by exactly one server, the one holding its Redis lock.
 * Every step reads the room's state from the database and asks
 * nextRoomAction what to do, and every service it calls is idempotent, so a
 * crash at any point is safe: phase deadlines live on the round row, and the
 * sweep restarts the room on whichever server takes the lock next.
 */
class RoundOrchestrator {
  #nodeId = randomUUID()
  // roomId -> { timer, tickTimer, botTimers, botsForRound }
  #rooms = new Map()
  #subscriber = null
  #sweepTimer = null
  #awayTimer = null
  // roomId -> when it last went idle, so the sweep leaves it alone for a while.
  #idleSince = new Map()

  get #context () {
    return { dbModels: models, sequelize, logger: Logger }
  }

  async start () {
    this.#subscriber = new Redis(redisClient.connection)
    // An explicit wake (a player joined or came back) overrides the idle back-off.
    this.#subscriber.on('message', (_channel, roomId) => {
      this.#idleSince.delete(Number(roomId))
      this.wake(Number(roomId))
    })
    await this.#subscriber.subscribe(ROOM_WAKE_CHANNEL)
    await this.#sweep()
    this.#sweepTimer = setInterval(() => { this.#sweep() }, RUNNER_SWEEP_INTERVAL_MS)
    this.#awayTimer = setInterval(() => { this.#releaseAbsentSeats() }, AWAY_CHECK_INTERVAL_MS)
    Logger.info('RoundOrchestrator', { message: `Started as ${this.#nodeId}` })
  }

  /** Stops every room on this server and hands its locks back, so another server resumes them at once. */
  async stop () {
    clearInterval(this.#sweepTimer)
    clearInterval(this.#awayTimer)
    await Promise.all([...this.#rooms.keys()].map(roomId => this.#release(roomId)))
    this.#subscriber?.disconnect()
  }

  /** Starts running a room on this server if no server is running it. */
  async wake (roomId) {
    if (!Number.isInteger(roomId) || this.#rooms.has(roomId)) return
    try {
      const acquired = await redisClient.client.set(lockKey(roomId), this.#nodeId, 'PX', RUNNER_LOCK_TTL_MS, 'NX')
      if (!acquired || this.#rooms.has(roomId)) return
      this.#rooms.set(roomId, { timer: null, tickTimer: null, botTimers: [], botsForRound: null })
      this.#schedule(roomId, 0)
    } catch (error) {
      Logger.error('RoundOrchestrator', { message: `Could not wake room ${roomId}`, exception: error })
    }
  }

  /** Picks up rooms nobody is running (e.g. after a crash) and keeps this server's locks alive. */
  async #sweep () {
    try {
      for (const roomId of this.#rooms.keys()) {
        if (!await this.#renew(roomId)) this.#forget(roomId)
      }
      const rooms = await sequelize.query(`
        SELECT r.room_id AS "roomId" FROM rooms r
        WHERE (r.status = 'OPEN' AND EXISTS (
                SELECT 1 FROM room_players rp WHERE rp.room_id = r.room_id AND rp.left_at IS NULL AND NOT rp.is_bot))
           OR EXISTS (
                SELECT 1 FROM rounds rd WHERE rd.room_id = r.room_id AND rd.status IN ('BETTING', 'BETS_CLOSED', 'SPINNING'))
      `, { type: QueryTypes.SELECT })
      const now = Date.now()
      const due = rooms.filter(({ roomId }) => !(now - (this.#idleSince.get(roomId) ?? -Infinity) < IDLE_RECHECK_MS))
      await Promise.all(due.map(({ roomId }) => this.wake(roomId)))
    } catch (error) {
      Logger.error('RoundOrchestrator', { message: 'Sweep failed', exception: error })
    }
  }

  #schedule (roomId, delayMs) {
    const state = this.#rooms.get(roomId)
    if (!state) return
    clearTimeout(state.timer)
    state.timer = setTimeout(() => { this.#step(roomId) }, Math.max(0, delayMs))
  }

  async #step (roomId) {
    const state = this.#rooms.get(roomId)
    if (!state) return
    try {
      if (!await this.#renew(roomId)) return this.#forget(roomId)

      const { Room, RoomPlayer, Round } = models
      const [room, round, humans] = await Promise.all([
        Room.findByPk(roomId),
        Round.findOne({ where: { roomId }, order: [['roundNumber', 'DESC']] }),
        RoomPlayer.count({ where: { roomId, leftAt: null, isBot: false } })
      ])
      if (!room) return this.#release(roomId)

      if (round?.status === ROUND_STATUS.BETTING) await this.#startBettingTimers(room, round, state)
      else this.#stopBettingTimers(state)

      // Only players actually connected to the table keep it dealing.
      const present = humans ? (await this.#tableSockets(roomId)).length : 0
      const now = new Date()
      const { action, at } = nextRoomAction(room, round, present, now)
      const context = this.#context
      let outcome = { successful: true }

      switch (action) {
        case ROOM_ACTIONS.WAIT:
          return this.#schedule(roomId, at - now)
        case ROOM_ACTIONS.IDLE:
          this.#idleSince.set(roomId, Date.now())
          return this.#release(roomId)
        case ROOM_ACTIONS.STOP:
          return this.#release(roomId)
        case ROOM_ACTIONS.OPEN_ROUND:
          outcome = await OpenRoundService.execute({ roomId }, context)
          break
        case ROOM_ACTIONS.CLOSE_BETTING:
          outcome = await CloseBettingService.execute({ roundId: round.roundId }, context)
          break
        case ROOM_ACTIONS.SPIN:
          outcome = await SpinRoundService.execute({ roundId: round.roundId }, context)
          break
        case ROOM_ACTIONS.SETTLE:
          outcome = await SettleRoundService.execute({ roundId: round.roundId }, context)
          break
        case ROOM_ACTIONS.END_ROOM:
          outcome = await EndRoomService.execute({ roomId }, context)
          break
      }

      if (!outcome.successful) {
        Logger.error('RoundOrchestrator', { message: `${action} failed in room ${roomId}`, fault: outcome.errors })
        return this.#schedule(roomId, RETRY_MS)
      }
      // Each action moves the room on; look again straight away.
      this.#schedule(roomId, 0)
    } catch (error) {
      Logger.error('RoundOrchestrator', { message: `Step failed in room ${roomId}`, exception: error })
      this.#schedule(roomId, RETRY_MS)
    }
  }

  /** Once per betting round: the countdown ticks and each bot's turn at a random moment. */
  async #startBettingTimers (room, round, state) {
    if (state.botsForRound === round.roundId) return
    this.#stopBettingTimers(state)
    state.botsForRound = round.roundId

    const ticking = () => {
      const secondsLeft = Math.max(0, Math.ceil((round.phaseEndsAt - Date.now()) / 1000))
      RouletteEmitter.roundTick(room.roomId, round.roundId, secondsLeft)
      if (!secondsLeft) clearInterval(state.tickTimer)
    }
    state.tickTimer = setInterval(ticking, TICK_MS)

    const bots = await models.RoomPlayer.findAll({ where: { roomId: room.roomId, leftAt: null, isBot: true } })
    const windowMs = Math.max(1, (round.phaseEndsAt - Date.now()) * BOT_WINDOW_SHARE - BOT_FIRST_MS)
    for (const bot of bots) {
      const delay = BOT_FIRST_MS + randomInt(Math.floor(windowMs))
      state.botTimers.push(setTimeout(() => {
        PlaceBotBetsService.execute({ roundId: round.roundId, roomPlayerId: bot.roomPlayerId }, this.#context)
          .catch(error => Logger.error('RoundOrchestrator', { message: 'Bot turn failed', exception: error }))
      }, delay))
    }
  }

  #stopBettingTimers (state) {
    clearInterval(state.tickTimer)
    state.botTimers.forEach(clearTimeout)
    state.botTimers = []
    state.botsForRound = null
  }

  #tableSockets (roomId) {
    return socketServer.of(SOCKET_NAMESPACES.ROULETTE).in(SOCKET_ROOMS.ROULETTE_TABLE(roomId)).fetchSockets()
  }

  /**
   * Gives up the seats of players gone longer than the grace period. Seats
   * marked away whose player is in fact connected (another tab) are cleared.
   * One server does this a minute, under a Redis lock.
   */
  async #releaseAbsentSeats () {
    try {
      const locked = await redisClient.client.set(AWAY_CHECK_LOCK, this.#nodeId, 'PX', AWAY_CHECK_INTERVAL_MS - 1000, 'NX')
      if (!locked) return
      const seats = await sequelize.query(`
        SELECT rp.room_id AS "roomId", rp.player_id AS "playerId"
        FROM room_players rp
        JOIN rooms r ON r.room_id = rp.room_id AND r.status IN ('WAITING', 'OPEN')
        WHERE rp.left_at IS NULL AND NOT rp.is_bot
          AND rp.away_since < now() - make_interval(secs => :graceSeconds)
      `, { replacements: { graceSeconds: config.get('game.awayUnseatSeconds') }, type: QueryTypes.SELECT })

      for (const { roomId, playerId } of seats) {
        const sockets = await this.#tableSockets(roomId)
        const context = this.#context
        if (sockets.some(socket => socket.data.playerId === playerId)) {
          await SetPresenceService.execute({ playerId, roomIds: [roomId], present: true }, context)
        } else {
          await LeaveRoomService.execute({ playerId, roomId }, context)
          Logger.info('RoundOrchestrator', { message: `Gave up player ${playerId}'s seat in room ${roomId} after they left` })
        }
      }
    } catch (error) {
      Logger.error('RoundOrchestrator', { message: 'Releasing absent seats failed', exception: error })
    }
  }

  async #renew (roomId) {
    return await redisClient.client.eval(RENEW_LOCK, 1, lockKey(roomId), this.#nodeId, RUNNER_LOCK_TTL_MS) === 1
  }

  async #release (roomId) {
    this.#forget(roomId)
    await redisClient.client.eval(RELEASE_LOCK, 1, lockKey(roomId), this.#nodeId)
  }

  #forget (roomId) {
    const state = this.#rooms.get(roomId)
    if (!state) return
    clearTimeout(state.timer)
    this.#stopBettingTimers(state)
    this.#rooms.delete(roomId)
  }
}

const roundOrchestrator = new RoundOrchestrator()

export default roundOrchestrator
