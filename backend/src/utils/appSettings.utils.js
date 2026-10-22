export const SETTING_KEYS = { ADS: 'ads' }

/** Where ads between rounds may show. On until an admin turns them off. */
export const DEFAULT_ADS = { web: true, app: true }

/** The stored ads setting with defaults filled in; ignores anything that isn't a boolean. */
export const readAds = (row) => {
  const stored = row?.value ?? {}
  return {
    web: typeof stored.web === 'boolean' ? stored.web : DEFAULT_ADS.web,
    app: typeof stored.app === 'boolean' ? stored.app : DEFAULT_ADS.app
  }
}
