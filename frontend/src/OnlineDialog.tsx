import { useState } from 'react'
import type { VariantName } from '@roulette/engine'
import { useI18n, type MessageKey } from './i18n'

export type OnlineMode = 'computer' | 'quick' | 'private'

export type OnlineChoice =
  | { mode: 'computer', variant: VariantName, bots: number }
  | { mode: 'quick', variant: VariantName }
  | { mode: 'private', variant: VariantName, bots: number }
  | { mode: 'join', code: string }

interface Props {
  mode: OnlineMode
  busy: boolean
  error: string | null
  /** Pre-fills the join code, e.g. from an invite link. */
  initialCode?: string
  onChoose: (choice: OnlineChoice) => void
  onClose: () => void
}

export function OnlineDialog ({ mode, busy, error, initialCode, onChoose, onClose }: Props) {
  const [variant, setVariant] = useState<VariantName>('AMERICAN')
  const [bots, setBots] = useState(mode === 'computer' ? 3 : 0)
  const [code, setCode] = useState(initialCode ?? '')
  const { t } = useI18n()
  const copy = (part: 'eyebrow' | 'title' | 'copy' | 'action') => t(`online.${mode}.${part}` as MessageKey)
  const validCode = /^[A-Z0-9]{6}$/.test(code)

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="online-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label={t('common.close')} onClick={onClose}>×</button>
        <p className="eyebrow">{copy('eyebrow')}</p>
        <h2 id="online-title">{copy('title')}</h2>
        <p className="dialog-copy">{copy('copy')}</p>

        <label htmlFor="online-variant">{t('online.wheel')}</label>
        <select id="online-variant" value={variant} onChange={event => setVariant(event.target.value as VariantName)}>
          <option value="AMERICAN">{t('online.american')}</option>
          <option value="ENGLISH">{t('online.european')}</option>
        </select>

        {mode !== 'quick' && (
          <>
            <p className="setup-label" id="online-bots">{t('online.bots')}</p>
            <div className="stepper" role="group" aria-labelledby="online-bots">
              <button type="button" aria-label={t('online.fewer')} disabled={bots <= (mode === 'computer' ? 1 : 0)} onClick={() => setBots(bots - 1)}>−</button>
              <output aria-live="polite">{bots}</output>
              <button type="button" aria-label={t('online.more')} disabled={bots >= 7} onClick={() => setBots(bots + 1)}>+</button>
            </div>
          </>
        )}

        <button
          type="button"
          className="btn-gold"
          disabled={busy}
          onClick={() => onChoose(mode === 'quick' ? { mode, variant } : { mode, variant, bots })}
        >
          {busy ? t('online.busy') : copy('action')}
        </button>

        {mode === 'private' && (
          <form className="join-code" onSubmit={event => { event.preventDefault(); if (validCode) onChoose({ mode: 'join', code }) }}>
            <div className="or" aria-hidden="true"><span>{t('online.orJoin')}</span></div>
            <label htmlFor="join-code">{t('online.tableCode')}</label>
            <div className="join-row">
              <input
                id="join-code"
                value={code}
                maxLength={6}
                size={6}
                autoComplete="off"
                spellCheck={false}
                placeholder="AB12CD"
                onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button type="submit" className="btn-ghost" disabled={busy || !validCode}>{t('online.join')}</button>
            </div>
          </form>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </div>
  )
}
