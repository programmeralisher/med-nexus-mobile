# Phase 9: Android packaging (Capacitor)

This app is packaged for Android via Capacitor's **`server.url`** mode: the
Android app is a thin native shell whose WebView navigates straight to the
same live deployed web app the desktop PWA already uses, instead of bundling
a static copy of the site inside the APK. See the comment block at the top
of `capacitor.config.ts` for why (short version: this app is server-rendered
with no static export, and every real screen needs a live Firebase/Firestore
connection anyway, so a bundled static shell couldn't show anything useful
on its own).

This means the Android app **always needs your real deployed HTTPS URL**
before it can be built for real use.

## One-time setup

1. **Bring the lockfile back in sync.** This patch adds new dependencies to
   `package.json` but could not regenerate `bun.lock` in the environment
   that prepared it (no `bun` binary available there). Run once:

   ```bash
   bun install
   ```

   (or `npm install` if you're not using bun for this project -- either
   works, just be consistent with whichever lockfile you keep committing.)

2. **Set your real deployed URL.** Open `capacitor.config.ts` and replace:

   ```ts
   const DEPLOYED_APP_URL = "https://REPLACE-WITH-YOUR-DEPLOYED-URL.example.com";
   ```

   with your actual production URL (the same Cloudflare Workers URL /
   custom domain the desktop PWA already points at).

3. **Install Android Studio + SDK**, if you haven't already:
   - Download from https://developer.android.com/studio
   - On first launch, let it install the Android SDK (SDK Platform 36 and
     the latest Build-Tools are what this project's Gradle config expects --
     see `android/variables.gradle`; the SDK Manager inside Android Studio
     will prompt to install whatever's missing the first time you open the
     project).
   - Make sure `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) is set in your shell
     environment, and that a JDK 17+ is available (Android Studio bundles
     its own JDK, which is fine).

## Building the APK

From the repo root:

```bash
# 1. Build the web app and copy the (unused-at-runtime, but required by
#    `cap sync`) web assets + sync native plugins into the android/ project.
npm run cap:sync

# 2. Open the native project in Android Studio...
npm run cap:open:android

# ...then in Android Studio: Build -> Build Bundle(s) / APK(s) -> Build APK(s).
```

**Or, entirely from the command line**, once the Android SDK is installed
and `ANDROID_HOME` is set:

```bash
npm run cap:sync
cd android
./gradlew assembleDebug
```

### Where the APK ends up

```
android/app/build/outputs/apk/debug/app-debug.apk
```

This debug APK is unsigned and installable directly on a device for testing
(`adb install app-debug.apk`), or via Android Studio's "Run" button on a
connected device/emulator.

### Building a release APK/AAB (for real distribution)

```bash
cd android
./gradlew assembleRelease   # APK, at android/app/build/outputs/apk/release/
# or
./gradlew bundleRelease     # AAB (Play Store format), at android/app/build/outputs/bundle/release/
```

A release build needs to be signed with your own keystore -- Android
Studio's **Build > Generate Signed Bundle / APK...** wizard is the easiest
way to create one and wire it up the first time.

## Re-syncing after future web changes

Any time the web app itself changes, re-run:

```bash
npm run cap:sync
```

before rebuilding in Android Studio -- this re-copies the (mostly unused,
but required) web assets and re-checks installed Capacitor plugins. Since
the app loads from `server.url` at runtime, you do **not** need to rebuild
the Android app just to ship a normal web change -- deploying the web app
(same as today) is enough for it to show up the next time the Android app
loads. You only need to rebuild/re-release the Android app itself when
something *native* changes (a new Capacitor plugin, an Android permission,
the app icon, etc.).

## What already works unchanged on Android

- Firebase Auth (anonymous) + the persistent-login local gate
- `allowedDevices` Firestore security (enforced server-side, unaffected by
  how the client loads)
- Firestore offline persistence and realtime sync
- Dashboard, Reports, Bulk Entry, Recover Deleted Credits
- Backup PDF generation (content and formatting are identical to web)

## What Capacitor plugins were added, and why

- **`@capacitor/browser`** -- WhatsApp reminder links (`wa.me/...`) now open
  via `Browser.open()` on native Android instead of `window.open()`. A plain
  WebView's `window.open()` does not hand a link off to the installed
  WhatsApp app; `Browser.open()` uses Chrome Custom Tabs under the hood,
  which does respect Android's app-link handling, so it opens WhatsApp
  itself, same as tapping the link in a normal browser.
- **`@capacitor/filesystem`** + **`@capacitor/share`** -- PDF backup/report
  downloads (`saveOrSharePdf` in `src/lib/nativePdf.ts`) now write the PDF to
  the app's private cache directory and open the native Share Sheet on
  Android, instead of relying on jsPDF's browser-only Blob-download trick,
  which does not reliably work inside a WebView.

Both fall back to the exact existing web behavior (`window.open`, `doc.save`)
whenever the app is not running inside Capacitor -- so nothing changes for
anyone using the app in a normal browser or as the desktop PWA.
