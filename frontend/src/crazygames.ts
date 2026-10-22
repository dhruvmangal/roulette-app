/**
 * Built for CrazyGames (`npm run build:crazygames`): the game runs in their frame with no
 * account and no server. Only the table against the computer and the practice games are
 * offered, and the only ads are theirs, through their SDK.
 */
export const onCrazyGames = import.meta.env.VITE_TARGET === 'crazygames'

interface CrazyGamesSdk {
  init: () => Promise<void>
  game: {
    loadingStart: () => void
    loadingStop: () => void
    gameplayStart: () => void
    gameplayStop: () => void
  }
  ad: {
    requestAd: (type: 'midgame' | 'rewarded', callbacks: { adStarted?: () => void, adFinished?: () => void, adError?: (error: unknown) => void }) => void
  }
}

declare global {
  interface Window { CrazyGames?: { SDK: CrazyGamesSdk } }
}

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js'

let ready: Promise<CrazyGamesSdk | null> | null = null

/** Loads and starts their SDK once. Null if it can't be reached (the game still plays, without ads). */
function sdk (): Promise<CrazyGamesSdk | null> {
  if (!onCrazyGames) return Promise.resolve(null)
  ready ??= new Promise<CrazyGamesSdk | null>(resolve => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.onload = () => {
      const loaded = window.CrazyGames?.SDK
      if (!loaded) { resolve(null); return }
      loaded.init().then(() => resolve(loaded), () => resolve(null))
    }
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })
  return ready
}

/** Call once at start-up: the SDK needs to know when loading begins and ends. */
export function startCrazyGames () {
  if (!onCrazyGames) return
  void sdk().then(loaded => {
    loaded?.game.loadingStart()
    // The first screen is up by the next frame.
    requestAnimationFrame(() => loaded?.game.loadingStop())
  })
}

/** The player is playing (a table or game is open) or is not (menus, ads). Their platform pauses things by it. */
export function setPlaying (playing: boolean) {
  void sdk().then(loaded => {
    try { if (playing) loaded?.game.gameplayStart(); else loaded?.game.gameplayStop() } catch { /* not worth interrupting play */ }
  })
}

/** Shows their between-rounds ad. Resolves when it is over, or at once if none could be shown. */
export function showCrazyGamesAd (): Promise<boolean> {
  return sdk().then(loaded => {
    if (!loaded) return false
    return new Promise<boolean>(resolve => {
      let shown = false
      try {
        loaded.ad.requestAd('midgame', {
          adStarted: () => { shown = true },
          adFinished: () => resolve(true),
          adError: () => resolve(shown)
        })
      } catch { resolve(false) }
    })
  })
}
