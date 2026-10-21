import express from 'express'
import config from '~/configs/app.config'
import { androidAssetLinks, appleAppSiteAssociation } from '~/utils/appLinks.utils'

const wellKnownRoutes = express.Router()

const serve = (build) => (_req, res) => {
  const body = build()
  if (!body) return res.sendStatus(404)
  // Both platforms fetch these directly and refuse redirects; they cache them themselves.
  res.set('Cache-Control', 'public, max-age=300').json(body)
}

/**
 * @openapi
 * /.well-known/apple-app-site-association:
 *   get:
 *     summary: Lets iOS open invite and referral links in the app (Universal Links)
 *     tags: [Mobile]
 *     responses:
 *       200: { description: JSON }
 *       404: { description: APPLE_TEAM_ID is not set }
 */
wellKnownRoutes.get('/apple-app-site-association', serve(() => appleAppSiteAssociation(config.get('appLinks.appleTeamId'))))

/**
 * @openapi
 * /.well-known/assetlinks.json:
 *   get:
 *     summary: Lets Android open invite and referral links in the app (App Links)
 *     tags: [Mobile]
 *     responses:
 *       200: { description: JSON }
 *       404: { description: ANDROID_CERT_SHA256 is not set }
 */
wellKnownRoutes.get('/assetlinks.json', serve(() => androidAssetLinks(config.get('appLinks.androidCertSha256'))))

export default wellKnownRoutes
