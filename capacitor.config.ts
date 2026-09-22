import type { CapacitorConfig } from "@capacitor/cli";

// ---------------------------------------------------------------------------
// Phase 9: Capacitor Android packaging.
//
// This app is server-rendered (TanStack Start SSR, deployed to Cloudflare
// Workers) -- there is no static prerendered site to bundle locally, and
// every real screen sits behind the password gate as Firebase-authenticated,
// live Firestore data anyway (Dashboard/Credits/Reports render nothing
// meaningful without a live connection), so a fully-offline "bundle
// everything into the APK" build would not actually change what a first
// launch can show even if one existed.
//
// So this loads the SAME deployed web app the desktop PWA already uses, via
// server.url, instead of a locally bundled static site. This is a standard,
// supported Capacitor mode (comparable to a Trusted Web Activity): the
// WebView navigates straight to the live URL, and the app's own existing
// service worker (public/sw.js -- already network-first with a cache
// fallback, from Phase 5) keeps working completely unchanged, giving the
// same offline behavior on Android as it already gives on desktop: first
// launch needs connectivity, every launch after that doesn't.
//
// webDir below still has to point at SOME existing folder for `npx cap
// sync` to run its asset-copy step, but because server.url is set below,
// whatever is in that folder is never actually loaded at runtime --
// Capacitor navigates straight to server.url instead. Pointing it at the
// app's own existing build output (.output/public, produced by the
// unmodified `npm run build`) means no second, Capacitor-only build
// pipeline is needed just to satisfy this.
//
// >>> REPLACE the placeholder URL below with the real deployed HTTPS URL
// >>> before running `npx cap sync android` for a real device/APK build.
// >>> See PHASE9-ANDROID.md for the full walkthrough. <<<
// ---------------------------------------------------------------------------

const DEPLOYED_APP_URL = "https://programmeralisher-med-nexus-mobile.zeeshanmedical.workers.dev";

const config: CapacitorConfig = {
  appId: "com.zeeshanmedical.khatta",
  appName: "Zeeshan Khatta",
  webDir: ".output/public",
  server: {
    url: DEPLOYED_APP_URL,
    // Firestore, Firebase Auth, and the wa.me WhatsApp links all require
    // HTTPS -- plain http:// (cleartext) traffic is intentionally left
    // disabled rather than opened up for this.
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};


export default config;
