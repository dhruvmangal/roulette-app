import config from '~/configs/app.config'
import { GetInvitePreviewService } from '~/services/game'
import Logger from '~/libs/logger'
import { RecordDeferredLinkService } from '~/services/link'
import { GetReferralPreviewService } from '~/services/referral'
import { createInvitePageTemplate } from '~/templates/invitePage.template'
import { catchAsync } from '~/utils/catchAsync.utils'

// The site's address as the visitor reached it (nginx passes Host and the scheme on).
const siteOrigin = (req) => (req.get('host') ? `${req.protocol}://${req.get('host')}` : config.get('frontendUrl'))

/** Remembers a phone opening a link, for the app to find if it gets installed. Never holds up the page. */
const rememberForApp = (req, kind, code) => {
  RecordDeferredLinkService.execute({ ip: req.ip, userAgent: req.get('user-agent') ?? null, kind, code }, req.context)
    .catch(exception => Logger.error('InviteController', { message: 'Could not remember a link for the app', exception }))
}

/**
 * Invite links are opened by people and by chat apps' link-preview robots,
 * so this answers with an HTML page rather than the API's JSON envelope.
 */
export default class InviteController {
  static page = catchAsync(async (req, res) => {
    const code = String(req.params.code).toUpperCase()
    const { result, successful } = await GetInvitePreviewService.execute({ code }, req.context)
    rememberForApp(req, 'join', code)
    const origin = siteOrigin(req)
    const preview = successful ? result : { title: 'You’re invited to play roulette 🎰', description: 'Play chips only, no real money.' }

    res.set('Cache-Control', 'public, max-age=60')
    res.type('html').send(createInvitePageTemplate({
      ...preview,
      imageUrl: `${origin}/og-invite.jpg`,
      pageUrl: `${origin}/join/${code}`,
      gameUrl: `${origin}/?join=${code}`
    }))
  })

  /** /r/CODE: a friend's referral link. The game keeps the code and applies it once the visitor has an account. */
  static referral = catchAsync(async (req, res) => {
    const code = String(req.params.code).toUpperCase()
    const { result, successful } = await GetReferralPreviewService.execute({ code }, req.context)
    rememberForApp(req, 'ref', code)
    const origin = siteOrigin(req)
    const preview = successful ? result : { title: 'You’re invited to play roulette 🎰', description: 'Play chips only, no real money.' }

    res.set('Cache-Control', 'public, max-age=60')
    res.type('html').send(createInvitePageTemplate({
      ...preview,
      imageUrl: `${origin}/og-referral.jpg`,
      pageUrl: `${origin}/r/${code}`,
      gameUrl: `${origin}/?ref=${code}`,
      imageAlt: 'A friend’s invitation to play roulette, with bonus chips',
      callToAction: 'Claim your bonus chips →'
    }))
  })
}
