import express from 'express'
import { isAuthenticated } from '~/rest-resources/middlewares/isAuthenticated.middleware'
import requestValidationMiddleware from '~/rest-resources/middlewares/requestValidation.middleware'
import responseValidationMiddleware from '~/rest-resources/middlewares/responseValidation.middleware'
import WalletController from '~/rest-resources/controllers/wallet.controller'
import { WALLET_TRANSACTION_TYPES } from '~/utils/constants/wallet.constants'

const walletRoutes = express.Router({ mergeParams: true })

/**
 * @openapi
 * /api/v1/wallet:
 *   get:
 *     summary: The signed-in player's chip balance
 *     tags: [Wallet]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The wallet
 */
walletRoutes.get(
  '/',
  isAuthenticated,
  requestValidationMiddleware({}),
  WalletController.getWallet,
  responseValidationMiddleware({})
)

/**
 * @openapi
 * /api/v1/wallet/transactions:
 *   get:
 *     summary: The signed-in player's ledger, newest first
 *     tags: [Wallet]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: string } }
 *       - { in: query, name: pageNo, schema: { type: string } }
 *       - { in: query, name: type, schema: { type: string } }
 *       - { in: query, name: from, schema: { type: string, format: date-time } }
 *       - { in: query, name: to, schema: { type: string, format: date-time } }
 *     responses:
 *       200:
 *         description: A page of ledger rows
 */
walletRoutes.get(
  '/transactions',
  isAuthenticated,
  requestValidationMiddleware({
    querySchema: {
      type: 'object',
      properties: {
        limit: { type: 'string', pattern: '^[0-9]+$' },
        pageNo: { type: 'string', pattern: '^[0-9]+$' },
        type: { enum: Object.values(WALLET_TRANSACTION_TYPES) },
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' }
      }
    }
  }),
  WalletController.getTransactions,
  responseValidationMiddleware({})
)

export default walletRoutes
