import type { CapacitorConfig } from '@capacitor/cli'

// Release builds (ROULETTE_RELEASE=1) talk to an HTTPS API only. Debug builds
// may also reach the dev stack on this machine over plain http
// (localhost from the iOS simulator, 10.0.2.2 from the Android emulator).
const release = process.env.ROULETTE_RELEASE === '1'

const config: CapacitorConfig = {
  appId: 'com.roulette.game',
  appName: 'Roulette',
  webDir: '../frontend/dist',
  backgroundColor: '#07070b',
  server: {
    cleartext: !release
  },
  android: {
    allowMixedContent: !release
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#07070b'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#07070b',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#07070b',
      overlaysWebView: true
    }
  }
}

export default config
