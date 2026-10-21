import { useState } from 'react'
import { MAX_SEATS, type VariantName } from '@roulette/engine'
import { useI18n } from './i18n'

export interface SetupChoice {
  variant: VariantName
  /** Names of the other people sharing this device. */
  guests: string[]
  bots: number
}

interface Props {
  initial: SetupChoice
  onStart: (choice: SetupChoice) => void
  onClose: () => void
}

/** Room for every guest and bot, given that "You" always takes a seat. */
export function fitSetup (choice: SetupChoice): SetupChoice {
  const guests = choice.guests.slice(0, MAX_SEATS - 1)
  return { ...choice, guests, bots: Math.max(0, Math.min(choice.bots, MAX_SEATS - 1 - guests.length)) }
}

export function TableSetup ({ initial, onStart, onClose }: Props) {
  const { t } = useI18n()
  const [choice, setChoice] = useState(() => fitSetup(initial))
  const { guests, bots } = choice
  const freeSeats = MAX_SEATS - 1 - guests.length - bots

  const update = (patch: Partial<SetupChoice>) => setChoice(current => ({ ...current, ...patch }))
  const renameGuest = (index: number, name: string) => update({ guests: guests.map((guest, i) => i === index ? name : guest) })

  function start () {
    onStart({ ...choice, guests: guests.map((name, i) => name.trim() || t('setup.playerN', { n: i + 2 })) })
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="dialog setup" role="dialog" aria-modal="true" aria-labelledby="setup-title" onClick={event => event.stopPropagation()}>
        <button type="button" className="dialog-close" aria-label={t('common.close')} onClick={onClose}>×</button>
        <p className="eyebrow">{t('setup.eyebrow', { max: MAX_SEATS })}</p>
        <h2 id="setup-title">{t('setup.title')}</h2>

        <label htmlFor="setup-variant">{t('online.wheel')}</label>
        <select id="setup-variant" value={choice.variant} onChange={event => update({ variant: event.target.value as VariantName })}>
          <option value="AMERICAN">{t('online.american')}</option>
          <option value="ENGLISH">{t('online.european')}</option>
        </select>

        <p className="setup-label">{t('setup.players')}</p>
        <ul className="setup-players">
          <li><span className="setup-you">{t('lobby.you')}</span></li>
          {guests.map((name, index) => (
            <li key={index}>
              <input aria-label={t('setup.nameOf', { n: index + 2 })} value={name} maxLength={16} placeholder={t('setup.playerN', { n: index + 2 })} onChange={event => renameGuest(index, event.target.value)} />
              <button type="button" className="setup-remove" aria-label={t('setup.remove', { name: name || t('setup.playerN', { n: index + 2 }) })} onClick={() => update({ guests: guests.filter((_, i) => i !== index) })}>×</button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-ghost small setup-add" disabled={freeSeats < 1} onClick={() => update({ guests: [...guests, ''] })}>{t('setup.add')}</button>
        <p className="setup-hint">{t('setup.hint')}</p>

        <p className="setup-label" id="bots-label">{t('online.bots')}</p>
        <div className="stepper" role="group" aria-labelledby="bots-label">
          <button type="button" aria-label={t('online.fewer')} disabled={bots < 1} onClick={() => update({ bots: bots - 1 })}>−</button>
          <output aria-live="polite">{bots}</output>
          <button type="button" aria-label={t('online.more')} disabled={freeSeats < 1} onClick={() => update({ bots: bots + 1 })}>+</button>
        </div>

        <button type="button" className="btn-gold" onClick={start}>{t('setup.start')}</button>
      </section>
    </div>
  )
}
