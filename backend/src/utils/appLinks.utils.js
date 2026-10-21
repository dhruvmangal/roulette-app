// The native app's identity: capacitor.config.ts appId, also the Android package name and the iOS bundle ID.
export const APP_ID = 'com.roulette.game'

// The only paths the site hands to the app; everything else stays in the browser.
export const APP_LINK_PATHS = ['/join/*', '/r/*']

const list = (text) => String(text || '').split(',').map(item => item.trim()).filter(Boolean)

/**
 * /.well-known/apple-app-site-association: tells iOS that this site's invite and
 * referral links belong to the app. Null until the Apple team ID is set.
 */
export const appleAppSiteAssociation = (teamId) => {
  const team = String(teamId || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{10}$/.test(team)) return null
  return {
    applinks: {
      details: [{ appIDs: [`${team}.${APP_ID}`], components: APP_LINK_PATHS.map(path => ({ '/': path })) }]
    }
  }
}

/**
 * /.well-known/assetlinks.json: tells Android that this site's links belong to the
 * app, if it is signed with one of these certificates. Null until one is set.
 */
export const androidAssetLinks = (fingerprints) => {
  const sha256 = list(fingerprints).map(print => print.toUpperCase())
  if (!sha256.length || sha256.some(print => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(print))) return null
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: APP_ID, sha256_cert_fingerprints: sha256 }
  }]
}
