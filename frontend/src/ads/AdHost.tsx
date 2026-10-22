import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { adsense, dismissWebAd, useWebAdOpen } from './ads'
import './ads.css'

/** Seconds before the close button works, so the ad is seen before it can be skipped. */
const SKIP_AFTER_S = 5

let scriptLoaded: Promise<void> | null = null
function loadAdSense (client: string) {
  scriptLoaded ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.async = true
    script.crossOrigin = 'anonymous'
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`
    script.onload = () => resolve()
    script.onerror = () => { scriptLoaded = null; reject(new Error('adsense')) }
    document.head.appendChild(script)
  })
  return scriptLoaded
}

/** The web's between-rounds ad: an AdSense unit in a dialog the player can close after a few seconds. */
export function AdHost () {
  const open = useWebAdOpen()
  return open ? <WebAd /> : null
}

function WebAd () {
  const { t } = useI18n()
  const [left, setLeft] = useState(SKIP_AFTER_S)
  const slot = useRef<HTMLModElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setLeft(seconds => Math.max(0, seconds - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    // If the script is blocked (ad blockers) there is nothing to wait for.
    loadAdSense(adsense.client)
      .then(() => {
        // Dev's StrictMode runs this twice; Google rejects a second push for the same unit.
        if (slot.current?.hasAttribute('data-adsbygoogle-status')) return
        try { ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ??= []).push({}) } catch (error) { console.warn('adsense', error) }
      })
      .catch(dismissWebAd)
    // No ad to show for this visitor: Google marks the unit unfilled, so don't hold the player for an empty box.
    const unit = slot.current
    if (!unit) return
    const watcher = new MutationObserver(() => { if (unit.dataset.adStatus === 'unfilled') dismissWebAd() })
    watcher.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] })
    return () => watcher.disconnect()
  }, [])

  return (
    <div className="ad-backdrop">
      <section className="dialog ad-dialog" role="dialog" aria-modal="true" aria-label={t('ads.label')}>
        <p className="eyebrow">{t('ads.label')}</p>
        <div className="ad-slot">
          <ins ref={slot} className="adsbygoogle" style={{ display: 'block' }} data-ad-client={adsense.client} data-ad-slot={adsense.slot} data-ad-format="auto" data-full-width-responsive="true" />
        </div>
        <button type="button" className="btn-gold" onClick={dismissWebAd} disabled={left > 0}>
          {left > 0 ? t('ads.closeIn', { seconds: left }) : t('ads.continue')}
        </button>
      </section>
    </div>
  )
}
