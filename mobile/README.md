# Roulette mobile apps

A Capacitor shell around the web app in `frontend/`. Android builds with
`make android-build` in `entrypoint/` (Docker, no local toolchain), iOS with
`npm run ios` (needs Xcode).

## Invite and referral links

People share two kinds of link, both on the website:

| Link | What it does |
| --- | --- |
| `https://<site>/join/CODE` | Seats you at a friend's private table |
| `https://<site>/r/CODE` | Applies a friend's referral code once you have an account |

The app also answers its own scheme, `roulette://join/CODE` and `roulette://r/CODE`.
That works as soon as the app is installed, with no website involved, and is the
way to test links on a device.

For an `https://` link to open **the app instead of the browser**, three things
must line up. Until they do, links open the website, which is fine: it plays the
same game.

1. **The site has a real domain** with HTTPS. Build the app with it:

   ```sh
   ROULETTE_PUBLIC_HOST=play.example.com VITE_PUBLIC_URL=https://play.example.com make android-build
   ```

   `ROULETTE_PUBLIC_HOST` is the host the Android intent filter and the iOS
   Associated Domains entitlement claim. `VITE_PUBLIC_URL` is the address the app
   puts in the links it shares (it has no address of its own). For iOS, pass
   `ROULETTE_PUBLIC_HOST=play.example.com` to `xcodebuild`, or set it in the
   Release build settings.

2. **The site vouches for the app.** Set these on the backend (see `entrypoint/.env.example`);
   nginx already sends `/.well-known/` to it:

   - `ANDROID_CERT_SHA256`: the SHA-256 fingerprint(s) of the certificate that signs
     the app, comma-separated. For Play Store builds this is the *app signing key*
     in Play Console → App integrity (add the upload key too to test uploaded builds).
   - `APPLE_TEAM_ID`: the 10-character Team ID from the Apple Developer account.

   Check them: `curl https://play.example.com/.well-known/assetlinks.json` and
   `.../apple-app-site-association` must answer 200 with JSON, with no redirect.

3. **The build is signed with that identity.** iOS: Associated Domains only exists in
   the *Release* configuration (`App/App.entitlements`) because it needs a paid Apple
   developer team; Debug builds and free personal teams are unaffected. Android: the
   debug key from `make android-build` is not the one in `ANDROID_CERT_SHA256`, so
   verified links only work for properly signed builds.

### Trying links on a device

```sh
# Android emulator or device
adb shell am start -a android.intent.action.VIEW -d "roulette://r/K7QM2XA"
adb shell am start -a android.intent.action.VIEW -d "roulette://join/AB12CD"

# iOS simulator
xcrun simctl openurl booted "roulette://r/K7QM2XA"
```

On Android, `adb shell pm get-app-links com.roulette.game` shows whether the
https host was verified.

### Links tapped before the app is installed

A link tapped on a phone that doesn't have the app opens the website. The server
remembers it for 24 hours (the phone type and the IP address it came from, nothing
else) and, the first time a freshly installed app starts, the app asks whether this
phone's network opened an invite or referral link just before. If exactly one link is
waiting it is handed over once and handled as if the app had been opened with it.

It is a best guess, so it errs on the side of saying nothing: two different links
waiting behind one address (a mobile carrier, an office) means no answer, and
link-preview robots such as WhatsApp's are ignored. Someone who installs on a different
network gets no link, and can type the code under Refer & earn in their first week.
The table is `deferred_links`; rows are deleted after a day.

## Push notifications

The server sends a push for: daily chips ready (once per claim, only to players who have
claimed before, never at night where they are), friend requests and invites, achievements,
and referral rewards. Players pick which in Settings. Someone who is connected sees the
same thing live in the app instead of getting a push.

Android phones are reached through Firebase Cloud Messaging and iPhones through Apple's
push service directly, so the iOS app needs no Firebase SDK. Nothing is sent, and nothing
breaks, until each is set up:

- **Android.** In the Firebase console add an Android app with package `com.roulette.game`,
  put its `google-services.json` in `mobile/android/app/` (it is not committed), and give
  the server a service account key as `FCM_SERVICE_ACCOUNT_JSON` (Project settings →
  Service accounts → Generate new private key).
- **iOS.** Needs a paid Apple developer team. In Certificates, Identifiers & Profiles make
  an APNs key (.p8), then give the server `APNS_KEY`, `APNS_KEY_ID` and `APNS_TEAM_ID`.
  `APNS_PRODUCTION=true` for TestFlight and App Store builds, `false` for builds run from
  Xcode. The `aps-environment` entitlement is in the Release configuration only, with the
  Associated Domains one (`App/App.entitlements`).

Until then, switching notifications on in Settings reports that this build isn't set up
for them. Browsers get no push: a closed tab can't be woken.

To try one: sign in on the app, allow notifications in Settings, then open the admin
app, go to the player's page and choose **Send test push**. It reports how many phones
were reached, or why none were.

### Sending announcements from the admin app

The admin app's **Notifications** page sends your own message to everyone with a phone
set up, to players who have been away for N days, or to one player. It shows how many
players and phones the choice reaches before you send, asks you to confirm, and records
each send in the audit log. Players can switch "News from Roulette" off in Settings.

Limits: title 65 and message 178 characters (lock screens cut longer text), at most 5
broadcasts a day (a test to one player doesn't count), and the same words for every
language. Large sends go out in the background in batches; each player's push has its
own key, so a retry can never deliver the same one twice. It refuses to send at all
while neither Firebase nor Apple is set up on the server.

## Ads (AdMob)

Interstitials between rounds use `@capacitor-community/admob`. Without ids the
app serves Google's **test** ads only. For a release build:

- `VITE_ADMOB_INTERSTITIAL_ANDROID` / `VITE_ADMOB_INTERSTITIAL_IOS`: interstitial ad unit ids, at web build time (`npm run web`).
- `ADMOB_APP_ID_ANDROID`: the AdMob app id (`ca-app-pub-…~…`), read by Gradle. For iOS, replace `GADApplicationIdentifier` in `ios/App/App/Info.plist`.
- Add Google's other SKAdNetwork ids to `Info.plist` (see Google's iOS setup guide).
- Set the app's age rating / child-directed settings in AdMob to match the store listing.

The web site uses AdSense: build the frontend with `VITE_ADSENSE_CLIENT=ca-pub-…` and `VITE_ADSENSE_SLOT=…`; the build also writes `ads.txt`.
