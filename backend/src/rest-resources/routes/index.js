import express from 'express'
import onHealthCheck from '~/helpers/healthCheck'
import contextMiddleware from '~/rest-resources/middlewares/context.middleware'
import apiRouter from './api'
import inviteRoutes from './invite.routes'
import referralLinkRoutes from './referralLink.routes'
import wellKnownRoutes from './wellKnown.routes'

const router = express.Router()

router.use('/api', contextMiddleware(false), apiRouter)
// Invite links (/join/CODE): nginx sends them here for their link-preview page.
router.use('/join', inviteRoutes)
// Referral links (/r/CODE): the same, for Refer & earn.
router.use('/r', referralLinkRoutes)
// Proof that the site's links belong to the mobile app (App Links / Universal Links).
router.use('/.well-known', wellKnownRoutes)

router.get('/health-check', async (_req, res) => {
  try {
    const response = await onHealthCheck()
    res.json(response)
  } catch (error) {
    res.status(503)
    res.send()
  }
})

router.get('/health', async (_req, res) => {
  try {
    const response = await onHealthCheck()
    res.json(response)
  } catch (error) {
    res.status(503)
    res.send()
  }
})

export default router
