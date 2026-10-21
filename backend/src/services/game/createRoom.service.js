import { randomInt } from 'crypto'
import { BOT_STYLES } from '@roulette/engine'
import ajv from '~/libs/ajv'
import ServiceBase from '~/services/serviceBase'
import {
  BOT_NAMES, BOT_START_BALANCE, MAX_SEATS, ROOM_DEFAULTS, ROOM_LIMITS, ROOM_MODES, ROOM_STATUS, VARIANTS
} from '~/utils/constants/game.constants'
import { SUCCESS_MSG } from '~/utils/constants/success'
import { generateRoomCode } from '~/utils/game.utils'
import { wakeRoom } from '~/utils/roomWake.utils'
import { withTransaction } from '~/utils/transaction.utils'
import { GetRoomStateService } from './getRoomState.service'

const between = ({ min, max }) => ({ type: 'integer', minimum: min, maximum: max })

const constraints = ajv.compile({
  type: 'object',
  properties: {
    playerId: { type: 'integer', minimum: 1 },
    variant: { enum: VARIANTS },
    mode: { enum: Object.values(ROOM_MODES) },
    bots: between(ROOM_LIMITS.bots),
    totalRounds: { anyOf: [between(ROOM_LIMITS.totalRounds), { type: 'null' }] },
    bettingSeconds: between(ROOM_LIMITS.bettingSeconds),
    minBet: between(ROOM_LIMITS.minBet),
    maxBet: between(ROOM_LIMITS.maxBet)
  },
  required: ['playerId', 'variant', 'mode']
})

const CODE_ATTEMPTS = 5

/**
 * Opens a table with the creator in seat 1 and any bots after them. A private
 * table opens as a lobby (WAITING): no rounds until its host starts the game.
 */
export class CreateRoomService extends ServiceBase {
  get constraints () {
    return constraints
  }

  async run () {
    const {
      playerId, variant, mode, totalRounds = null,
      bettingSeconds = ROOM_DEFAULTS.bettingSeconds, minBet = ROOM_DEFAULTS.minBet, maxBet = ROOM_DEFAULTS.maxBet
    } = this.args
    const bots = this.args.bots ?? (mode === ROOM_MODES.VS_COMPUTER ? ROOM_DEFAULTS.vsComputerBots : 0)
    const { dbModels: { Room, RoomPlayer } } = this.context

    if (maxBet < minBet) return this.addError('InvalidRoomSettingsErrorType', 'maxBet must be at least minBet')
    if (1 + bots > MAX_SEATS) return this.addError('InvalidRoomSettingsErrorType', `at most ${MAX_SEATS - 1} bots fit`)

    const room = await withTransaction(this, async (transaction) => {
      let code
      for (let attempt = 0; attempt < CODE_ATTEMPTS && !code; attempt++) {
        const candidate = generateRoomCode()
        if (!await Room.findOne({ where: { code: candidate }, transaction })) code = candidate
      }

      const created = await Room.create({
        code,
        variant,
        mode,
        maxSeats: MAX_SEATS,
        totalRounds,
        minBet,
        maxBet,
        bettingSeconds,
        status: mode === ROOM_MODES.PRIVATE ? ROOM_STATUS.WAITING : ROOM_STATUS.OPEN,
        // Public tables belong to nobody.
        hostPlayerId: mode === ROOM_MODES.PUBLIC ? null : playerId
      }, { transaction })

      const joinedAt = new Date()
      // Away until the player's socket arrives at the table (see SetPresenceService).
      await RoomPlayer.create({ roomId: created.roomId, playerId, seat: 1, joinedAt, awaySince: joinedAt }, { transaction })
      const firstName = randomInt(BOT_NAMES.length)
      for (let i = 0; i < bots; i++) {
        await RoomPlayer.create({
          roomId: created.roomId,
          seat: i + 2,
          isBot: true,
          botProfile: {
            name: BOT_NAMES[(firstName + i) % BOT_NAMES.length],
            style: BOT_STYLES[i % BOT_STYLES.length],
            balance: BOT_START_BALANCE
          },
          joinedAt
        }, { transaction })
      }
      return created
    })
    if (!room) return

    await wakeRoom(room.roomId)
    const state = await GetRoomStateService.execute({ roomId: room.roomId, playerId }, this.context)
    if (!state.successful) return this.mergeErrors(state.errors)
    return { ...state.result, message: SUCCESS_MSG.ROOM_CREATED }
  }
}
