/**
 * The game's pages: the address each screen lives at, and what search engines
 * and link previews should say about it. Kept free of browser imports so the
 * build can use it to write the static pages, sitemap and robots.txt.
 */
export type Screen = 'home' | 'wallet' | 'bonuses' | 'history' | 'analytics' | 'learn' | 'refer' | 'settings' | 'friends' | 'achievements' | 'leaderboard'

export interface Route {
  screen: Screen
  path: string
  title: string
  description: string
  /** Pages behind a sign-in have nothing for a crawler to read. */
  indexable: boolean
}

export const SITE_NAME = 'Roulette'

const PLAY_ONLY = 'Play chips only, no real money.'

export const ROUTES: readonly Route[] = [
  {
    screen: 'home',
    path: '/',
    title: 'Roulette: Play Free Online 3D American & European Roulette',
    description: `Spin a real 3D roulette wheel. Play American or European roulette online with friends, or practise offline against the computer. ${PLAY_ONLY}`,
    indexable: true
  },
  {
    screen: 'learn',
    path: '/learn',
    title: 'Learn Roulette: Odds, Payouts & Betting Strategies | Roulette',
    description: 'How roulette really works: bet types, payouts, house edge on American and European wheels, and simulations of Martingale, Fibonacci and other betting systems.',
    indexable: true
  },
  {
    screen: 'leaderboard',
    path: '/leaderboard',
    title: 'Leaderboard: Top Roulette Players | Roulette',
    description: 'See who is winning the most chips at the table. Climb the roulette leaderboard with play chips, never real money.',
    indexable: false
  },
  {
    screen: 'friends',
    path: '/friends',
    title: 'Friends: Invite & Play Roulette Together | Roulette',
    description: 'Add friends, see who is online and invite them to a private roulette table.',
    indexable: false
  },
  {
    screen: 'achievements',
    path: '/achievements',
    title: 'Achievements | Roulette',
    description: 'Your roulette achievements and the chip rewards they unlock.',
    indexable: false
  },
  {
    screen: 'refer',
    path: '/refer',
    title: 'Refer & Earn Chips | Roulette',
    description: 'Share your referral link and earn play chips when friends join the table.',
    indexable: false
  },
  {
    screen: 'bonuses',
    path: '/bonuses',
    title: 'Bonuses | Roulette',
    description: 'Claim your free play-chip bonuses.',
    indexable: false
  },
  {
    screen: 'wallet',
    path: '/wallet',
    title: 'Wallet | Roulette',
    description: 'Your play-chip balance and transactions.',
    indexable: false
  },
  {
    screen: 'history',
    path: '/history',
    title: 'Game History | Roulette',
    description: 'Every spin you have played, round by round.',
    indexable: false
  },
  {
    screen: 'analytics',
    path: '/analytics',
    title: 'Analytics | Roulette',
    description: 'Charts of your roulette sessions: wins, losses and favourite bets.',
    indexable: false
  },
  {
    screen: 'settings',
    path: '/settings',
    title: 'Settings | Roulette',
    description: 'Language, sound and table preferences.',
    indexable: false
  }
]

const normalise = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path).toLowerCase() || '/'

/** The route for an address bar path, or null when no page lives there. */
export function routeForPath (path: string): Route | null {
  const wanted = normalise(path)
  return ROUTES.find(route => route.path === wanted) ?? null
}

export const routeForScreen = (screen: Screen): Route => ROUTES.find(route => route.screen === screen)!

/** What a crawler should read at `origin` (no trailing slash): the URLs worth indexing. */
export const sitemapPaths = (): string[] => ROUTES.filter(route => route.indexable).map(route => route.path)
