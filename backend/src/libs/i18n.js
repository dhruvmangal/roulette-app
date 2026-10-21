import i18n from 'i18n'
import path from 'path'

i18n.configure({
  locales: ['en-US'],
  defaultLocale: 'en-US',
  syncFiles: true,
  // autoReload uses fs.watch() on the locales directory, which leaves an
  // open handle — harmless for a long-running server, but it hangs test
  // runners/CI and can misbehave on some container volume mounts. Turn it
  // back on if you need hot-reloading translation files in dev.
  autoReload: false,
  directory: path.join(__dirname, '../locals')
})

export default i18n
