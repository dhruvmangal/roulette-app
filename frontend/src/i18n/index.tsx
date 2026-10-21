import { createContext, Fragment, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { getPreferences, usePreferences } from '../preferences'
import { createTemplates, createTranslator, resolveLocale, splitTemplate, type Locale, type Messages, type Vars } from './core'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { hi } from './hi'

export { LOCALES, type LanguageChoice, type Locale } from './core'

export const catalogs: Record<Locale, Messages> = { en, hi, es, fr }

/** 'friends.count_one' and 'friends.count_other' are both asked for as 'friends.count'. */
type Base<K extends string> = K extends `${infer B}_${'zero' | 'one' | 'two' | 'few' | 'many' | 'other'}` ? B : K
export type MessageKey = Base<keyof typeof en & string>
export type Translate = (key: MessageKey, vars?: Vars) => string

const translators = new Map<Locale, Translate>()
const translatorFor = (locale: Locale): Translate => {
  let translator = translators.get(locale)
  if (!translator) { translator = createTranslator(locale, catalogs) as Translate; translators.set(locale, translator) }
  return translator
}

const browserLanguages = () => (typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language])

/** The language in use right now: the player's choice, or the device's. */
export const currentLocale = (): Locale => resolveLocale(getPreferences().language, browserLanguages())

/** For code outside React (the dealer's lines); components use useT(). */
export const translate: Translate = (key, vars) => translatorFor(currentLocale())(key, vars)

interface I18n {
  locale: Locale
  t: Translate
  /** Like t, but fills the {placeholders} with components (a coloured number, a link) and returns nodes. */
  rich: (key: MessageKey, slots: Record<string, ReactNode>) => ReactNode
  number: (value: number, options?: Intl.NumberFormatOptions) => string
  date: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string
}

const build = (locale: Locale): I18n => ({
  locale,
  t: translatorFor(locale),
  rich: (key, slots) => splitTemplate(createTemplates(locale, catalogs)(key)).map((part, index) =>
    <Fragment key={index}>{'text' in part ? part.text : slots[part.slot] ?? `{${part.slot}}`}</Fragment>
  ),
  number: (value, options) => new Intl.NumberFormat(locale, options).format(value),
  date: (value, options = { dateStyle: 'medium' }) => new Intl.DateTimeFormat(locale, options).format(new Date(value))
})

const Context = createContext<I18n>(build('en'))

/** Re-renders everything that asks for text when the language changes, without remounting the app. */
export function I18nProvider ({ children }: { children: ReactNode }) {
  const { language } = usePreferences()
  const locale = resolveLocale(language, browserLanguages())
  const value = useMemo(() => build(locale), [locale])
  useEffect(() => { document.documentElement.lang = locale }, [locale])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export const useI18n = () => useContext(Context)
export const useT = () => useContext(Context).t
