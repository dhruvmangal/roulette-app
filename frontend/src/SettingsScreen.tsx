import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { NotificationCategory, NotificationSettings } from '@roulette/contracts'
import { playChip, playResult } from './audio'
import { speak, hasVoiceFor, speechSupported } from './dealer/speech'
import { LOCALES, useI18n, type LanguageChoice } from './i18n'
import { tapFeedback } from './native'
import { isNativeApp } from './platform'
import { disablePush, enablePush, pushPermission, type PushPermission } from './push'
import { useSession } from './session'
import { setPreferences, usePreferences } from './preferences'

function Switch ({ label, hint, checked, onChange }: { label: string, hint?: string, checked: boolean, onChange: (next: boolean) => void }) {
  return (
    <label className="setting-row">
      <span className="setting-text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={event => onChange(event.target.checked)} />
    </label>
  )
}

function Slider ({ label, value, onChange, disabled }: { label: string, value: number, onChange: (next: number) => void, disabled?: boolean }) {
  return (
    <label className="setting-row setting-slider">
      <span className="setting-text"><strong>{label}</strong></span>
      <input type="range" min={0} max={100} step={5} value={Math.round(value * 100)} disabled={disabled} aria-valuetext={`${Math.round(value * 100)}%`} onChange={event => onChange(Number(event.target.value) / 100)} />
      <output>{Math.round(value * 100)}%</output>
    </label>
  )
}

const CATEGORIES: NotificationCategory[] = ['dailyBonus', 'friends', 'achievements', 'referrals', 'announcements']

/** Which notifications this phone gets. Needs the app (a browser tab can't be woken) and an account. */
function Notifications () {
  const { api, status } = useSession()
  const { t } = useI18n()
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [permission, setPermission] = useState<PushPermission>('prompt')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setPermission(await pushPermission())
    setSettings(await api.notificationSettings().catch(() => null))
  }, [api])
  useEffect(() => { if (status === 'signedIn') void load() }, [status, load])

  const on = settings !== null && settings.devices > 0 && permission === 'granted'

  async function toggle (next: boolean) {
    setBusy(true)
    setMessage(null)
    if (next) {
      const result = await enablePush(api)
      if (result === 'denied') setMessage(t('notifications.denied'))
      if (result === 'error') setMessage(t('notifications.error'))
    } else {
      await disablePush(api)
    }
    await load()
    setBusy(false)
  }

  async function category (name: NotificationCategory, value: boolean) {
    setSettings(current => current && { ...current, prefs: { ...current.prefs, [name]: value } })
    setSettings(await api.updateNotificationSettings({ [name]: value }).catch(() => settings))
  }

  return (
    <section className="analytics-card" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading">{t('notifications.title')}</h2>
      {!isNativeApp
        ? <p className="analytics-note">{t('notifications.webOnly')}</p>
        : status !== 'signedIn'
          ? <p className="analytics-note">{t('notifications.signedOut')}</p>
          : (
            <>
              <p className="analytics-note">{t('notifications.lede')}</p>
              <Switch label={t('notifications.allow')} hint={t('notifications.allowHint')} checked={on} onChange={next => { if (!busy) void toggle(next) }} />
              {message && <p className="form-error" role="alert">{message}</p>}
              {on && settings && (
                <>
                  <p className="stat-label setting-heading">{t('notifications.categories')}</p>
                  {CATEGORIES.map(name => <Switch key={name} label={t(`notifications.${name}`)} checked={settings.prefs[name]} onChange={value => { void category(name, value) }} />)}
                </>
              )}
            </>
            )}
    </section>
  )
}

/** Sound, language, and anything else that is a per-device choice. */
export function SettingsScreen ({ extra }: { extra?: ReactNode }) {
  const { t, locale } = useI18n()
  const preferences = usePreferences()
  const [voicesReady, setVoicesReady] = useState(0)

  // Browsers load their voices late: ask again when they arrive.
  useEffect(() => {
    if (!speechSupported()) return
    const update = () => setVoicesReady(count => count + 1)
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])

  const sample = () => {
    playChip()
    tapFeedback()
    window.setTimeout(() => playResult(true, false), 250)
    if (preferences.voice) speak(t('sound.sampleCall'), false, () => {}, () => {})
  }

  const options: Array<{ id: LanguageChoice, label: string, note?: string }> = [
    { id: 'auto', label: t('language.auto') },
    ...LOCALES.map(option => ({ id: option.id, label: option.native, note: option.id === 'en' ? undefined : option.name }))
  ]
  const missingVoice = voicesReady >= 0 && speechSupported() && locale !== 'en' && !hasVoiceFor(locale)

  return (
    <main className="page settings">
      <section className="page-head">
        <p className="eyebrow">{t('settings.eyebrow')}</p>
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="lede">{t('settings.lede')}</p>
      </section>

      <section className="analytics-card" aria-labelledby="sound-heading">
        <h2 id="sound-heading">{t('sound.title')}</h2>
        <Slider label={t('sound.volume')} value={preferences.volume} onChange={volume => setPreferences({ volume })} />
        {preferences.volume === 0 && <p className="analytics-note">{t('sound.silent')}</p>}
        <Switch label={t('sound.effects')} hint={t('sound.effectsHint')} checked={preferences.effects} onChange={effects => setPreferences({ effects })} />
        <Switch label={t('sound.wheel')} hint={t('sound.wheelHint')} checked={preferences.wheel} onChange={wheel => setPreferences({ wheel })} />
        <Switch label={t('sound.voice')} hint={t('sound.voiceHint')} checked={preferences.voice} onChange={voice => setPreferences({ voice })} />
        <Slider label={t('sound.voiceVolume')} value={preferences.voiceVolume} disabled={!preferences.voice} onChange={voiceVolume => setPreferences({ voiceVolume })} />
        {isNativeApp && <Switch label={t('sound.haptics')} hint={t('sound.hapticsHint')} checked={preferences.haptics} onChange={haptics => setPreferences({ haptics })} />}
        <button type="button" className="btn-ghost small" onClick={sample}>{t('sound.sample')}</button>
      </section>

      <section className="analytics-card" aria-labelledby="chat-heading">
        <h2 id="chat-heading">{t('chat.settings')}</h2>
        <Switch label={t('chat.showBets')} hint={t('chat.showBetsHint')} checked={preferences.chatBets} onChange={chatBets => setPreferences({ chatBets })} />
        <Switch label={t('chat.shareBets')} hint={t('chat.shareBetsHint')} checked={preferences.shareBets} onChange={shareBets => setPreferences({ shareBets })} />
      </section>

      <section className="analytics-card" aria-labelledby="language-heading">
        <h2 id="language-heading">{t('language.title')}</h2>
        <div className="language-list" role="radiogroup" aria-label={t('language.title')}>
          {options.map(option => (
            <button key={option.id} type="button" role="radio" aria-checked={preferences.language === option.id} className={`language-option${preferences.language === option.id ? ' is-active' : ''}`} onClick={() => setPreferences({ language: option.id })}>
              <span>{option.label}</span>{option.note && <small>{option.note}</small>}
            </button>
          ))}
        </div>
        <p className="analytics-note">{missingVoice ? t('language.noVoice') : t('language.hint')}</p>
      </section>

      <Notifications />
      {extra}
    </main>
  )
}
