/**
 * The language machinery with no React or browser in it, so it can be tested on its own.
 * English is the source: every key exists there, and another language only needs the
 * keys it has translated (the rest fall back to English).
 */
export type Messages = Record<string, string>

export const LOCALES = [
  { id: 'en', name: 'English', native: 'English', speech: 'en' },
  { id: 'hi', name: 'Hindi', native: 'हिन्दी', speech: 'hi' },
  { id: 'es', name: 'Spanish', native: 'Español', speech: 'es' },
  { id: 'fr', name: 'French', native: 'Français', speech: 'fr' }
] as const

export type Locale = typeof LOCALES[number]['id']
export type LanguageChoice = 'auto' | Locale

export const isLocale = (value: unknown): value is Locale => LOCALES.some(locale => locale.id === value)

/** The best supported language for a browser's preference list, e.g. ['hi-IN', 'en'] → 'hi'. */
export function matchLocale (preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    if (isLocale(base)) return base
  }
  return 'en'
}

export const resolveLocale = (choice: LanguageChoice, preferred: readonly string[]): Locale => choice === 'auto' ? matchLocale(preferred) : choice

export type Vars = Record<string, string | number>

/** Fills {name} placeholders; a missing value is left visible rather than hidden. */
export const fill = (template: string, vars?: Vars) =>
  vars ? template.replace(/\{(\w+)\}/g, (whole, name: string) => name in vars ? String(vars[name]) : whole) : template

/**
 * A translator for one language. With a `count`, the plural form is chosen by the
 * language's own rules: 'friends.count' looks for 'friends.count_one', then '_other'.
 */
export function createTranslator (locale: Locale, catalogs: Record<Locale, Messages>) {
  const rules = new Intl.PluralRules(locale)
  const lookup = (key: string) => catalogs[locale][key] ?? catalogs.en[key]
  return (key: string, vars?: Vars): string => {
    if (vars && typeof vars.count === 'number') {
      const form = lookup(`${key}_${rules.select(vars.count)}`) ?? lookup(`${key}_other`)
      if (form !== undefined) return fill(form, vars)
    }
    return fill(lookup(key) ?? key, vars)
  }
}

/** The {placeholders} a message uses, sorted. */
export const placeholders = (message: string) => [...new Set([...message.matchAll(/\{(\w+)\}/g)].map(match => match[1]))].sort()

/** The untouched template for a key (placeholders and all), falling back to English. */
export const createTemplates = (locale: Locale, catalogs: Record<Locale, Messages>) =>
  (key: string): string => catalogs[locale][key] ?? catalogs.en[key] ?? key

/**
 * Splits a template into text and the pieces named in {placeholders}, so a translated sentence
 * can hold components (a coloured number, a link) where the translator put them.
 */
export function splitTemplate (template: string): Array<{ text: string } | { slot: string }> {
  return template.split(/\{(\w+)\}/g).map((part, index) => index % 2 ? { slot: part } : { text: part }).filter(part => !('text' in part) || part.text !== '')
}
