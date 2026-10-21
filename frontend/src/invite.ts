import type { VariantName } from '@roulette/engine'
import { parseDeepLink, withoutDeepLink, type DeepLink } from './deepLink'
import { translate } from './i18n'
import { apiOrigin, isNativeApp } from './platform'


/**
 * The site friends open from an invite. The browser shares its own address;
 * the app has none of its own, so it shares VITE_PUBLIC_URL (the website) or,
 * in development, the server it talks to.
 */
const publicOrigin = () => (import.meta.env.VITE_PUBLIC_URL as string | undefined) || (isNativeApp ? apiOrigin : window.location.origin)

/**
 * /join/CODE: behind the stack's nginx the server answers it with a preview
 * page (title, description and image for WhatsApp, Telegram, iMessage...) that
 * forwards to the game; served by the site alone, the game reads the path itself.
 */
export const inviteUrl = (code: string) => `${publicOrigin()}/join/${code}`

export const variantTitle = (variant: VariantName) => translate(variant === 'AMERICAN' ? 'variant.AMERICAN' : 'variant.ENGLISH')

export interface InviteDetails {
  code: string
  variant: VariantName
  /** Who is inviting, e.g. the host's username. */
  from: string | null
}

/** The message that goes with an invite, in chat apps and the share sheet. */
export function inviteText ({ code, variant, from }: InviteDetails) {
  const variantName = variantTitle(variant)
  return [
    from ? translate('share.table.from', { name: from, variant: variantName }) : translate('share.table.anon', { variant: variantName }),
    '',
    translate('share.table.tap', { url: inviteUrl(code) }),
    translate('share.table.code', { code }),
    '',
    translate('share.fine')
  ].join('\n')
}

/**
 * The invite or referral link this page was opened with (/join/CODE, /r/CODE,
 * ?join=CODE or ?ref=CODE), if any. It is taken out of the address bar, so a
 * reload doesn't act on it twice.
 */
export function takeLinkFromUrl (): DeepLink | null {
  const link = parseDeepLink(window.location.href)
  if (link) window.history.replaceState(null, '', withoutDeepLink(window.location.href))
  return link
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable (plain http). */
export async function copyText (text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  }
}

// ── Refer & earn ────────────────────────────────────────────────────

const PENDING_REF_KEY = 'roulette.referral'

/** The link a player shares to refer friends; the server answers it with a preview page, then forwards to the game. */
export const referralUrl = (code: string) => `${publicOrigin()}/r/${code}`

/** The message that goes with a referral link. */
export function referralText (code: string, from: string | null, friendReward: number) {
  return [
    from ? translate('share.ref.from', { name: from }) : translate('share.ref.anon'),
    '',
    translate('share.ref.join', { amount: friendReward.toLocaleString(), url: referralUrl(code) }),
    translate('share.ref.code', { code }),
    '',
    translate('share.fine')
  ].join('\n')
}

const storage = () => { try { return window.localStorage } catch { return null } }

/** Keeps a friend's referral code until the player has an account to claim it with. */
export const keepReferral = (code: string) => storage()?.setItem(PENDING_REF_KEY, code)
export const pendingReferral = () => storage()?.getItem(PENDING_REF_KEY) ?? null
export const clearPendingReferral = () => storage()?.removeItem(PENDING_REF_KEY)
