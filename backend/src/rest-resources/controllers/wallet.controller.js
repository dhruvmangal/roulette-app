import { GetWalletService, GetWalletTransactionsService } from '~/services/wallet'
import { sendResponse } from '~/utils/response.helpers'
import { catchAsync } from '~/utils/catchAsync.utils'

// Read-only: no route lets a player move chips themselves.
export default class WalletController {
  static getWallet = catchAsync(async (req, res, next) => {
    const { result, successful, errors } = await GetWalletService.execute({ playerId: req.user.playerId }, req.context)
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })

  static getTransactions = catchAsync(async (req, res, next) => {
    const { limit, pageNo, type, from, to } = req.query
    const { result, successful, errors } = await GetWalletTransactionsService.execute(
      { playerId: req.user.playerId, limit, pageNo, type, from, to },
      req.context
    )
    sendResponse({ req, res, next }, { result, successful, serviceErrors: errors })
  })
}
