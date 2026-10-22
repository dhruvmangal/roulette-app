import { useState } from 'react'
import type { ProviderToken } from '@roulette/contracts'
import { GoogleButton } from './GoogleButton'
import { useI18n, type MessageKey } from './i18n'
import { errorMessage, useSession } from './session'
import { isNativeApp } from './platform'

interface Props {
  /** Why sign-in is being asked for, as a message key, e.g. 'signin.reason.play'. */
  reason?: MessageKey
  onDone: () => void
  onClose: () => void
}

/** Sign in with Google, or play as a guest and save the account later. */
export function SignInDialog ({ reason, onDone, onClose }: Props) {
  const { providers, signIn, playAsGuest } = useSession()
  const { t, rich } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function attempt (work: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await work()
      onDone()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog sign-in" role="dialog" aria-modal="true" aria-labelledby="sign-in-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label={t('common.close')} onClick={onClose}>×</button>
        <p className="eyebrow">{reason ? t(reason) : t('signin.welcome')}</p>
        <h2 id="sign-in-title">{t('signin.title')}</h2>
        <p className="dialog-copy">{t('signin.copy')}</p>
        <div className="sign-in-options" aria-busy={busy}>
          {providers === null && <p className="dialog-copy">{t('signin.loading')}</p>}
          {/* Google refuses its web sign-in inside app web views; the app needs native sign-in. */}
          {providers?.google && !isNativeApp && (
            <GoogleButton clientId={providers.google.clientId} onCredential={(token: ProviderToken) => attempt(() => signIn('google', token))} />
          )}
          {isNativeApp && <p className="dialog-copy">{t('signin.nativeNote')}</p>}
          {providers && !providers.google && !providers.apple && !isNativeApp && <p className="dialog-copy">{t('signin.notSetUp')}</p>}
          <div className="or" aria-hidden="true"><span>{t('signin.or')}</span></div>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => attempt(playAsGuest)}>{t('signin.guest')}</button>
          <p className="fine">{t('signin.guestNote')}</p>
        </div>
        <p className="fine legal-note">{rich('signin.legal', { terms: <a href="/terms" target="_blank" rel="noopener">{t('legal.terms')}</a>, privacy: <a href="/privacy" target="_blank" rel="noopener">{t('legal.privacy')}</a> })}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  )
}

/** Links Google to a guest, so the account and its chips are kept. */
export function SaveAccountDialog ({ onClose }: { onClose: () => void }) {
  const { providers, link } = useSession()
  const { t } = useI18n()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function save (token: ProviderToken) {
    setError(null)
    try {
      await link('google', token)
      setSaved(true)
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog sign-in" role="dialog" aria-modal="true" aria-labelledby="save-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label={t('common.close')} onClick={onClose}>×</button>
        <p className="eyebrow">{t('save.eyebrow')}</p>
        <h2 id="save-title">{saved ? t('save.titleDone') : t('save.title')}</h2>
        {saved
          ? (
            <>
              <p className="dialog-copy">{t('save.doneCopy')}</p>
              <button type="button" className="btn-gold" onClick={onClose}>{t('save.back')}</button>
            </>
            )
          : (
            <>
              <p className="dialog-copy">{t('save.copy')}</p>
              <div className="sign-in-options">
                {providers?.google && !isNativeApp
                  ? <GoogleButton clientId={providers.google.clientId} text="signin_with" onCredential={save} />
                  : <p className="dialog-copy">{t('save.notSetUp')}</p>}
              </div>
            </>
            )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  )
}
