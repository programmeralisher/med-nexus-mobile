import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getAuth, type Auth } from "firebase/auth";

/**
 * Firebase web config. These values are NOT secrets — they are meant to ship
 * inside client bundles/APKs; every Firebase web/Capacitor app embeds them.
 * Real access control comes entirely from Firestore Security Rules + Auth,
 * not from hiding this config, so there is no need to obfuscate it.
 *
 * Sourced from VITE_* env vars (see .env.example) rather than hardcoded so
 * per-environment values stay out of source control. The Lovable Vite config
 * already auto-injects VITE_* vars (see the comment in vite.config.ts).
 */
const rawConfig = {
  apiKey: import.meta.env["VITE_FIREBASE_API_KEY"] as string | undefined,
  authDomain: import.meta.env["VITE_FIREBASE_AUTH_DOMAIN"] as string | undefined,
  projectId: import.meta.env["VITE_FIREBASE_PROJECT_ID"] as string | undefined,
  storageBucket: import.meta.env["VITE_FIREBASE_STORAGE_BUCKET"] as string | undefined,
  messagingSenderId: import.meta.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] as string | undefined,
  appId: import.meta.env["VITE_FIREBASE_APP_ID"] as string | undefined,
  // measurementId is intentionally omitted: Firebase Analytics is not
  // initialized at all (see below), so there is nothing to pass it to.
};

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

export interface FirebaseServices {
  app: FirebaseApp;
  db: Firestore;
  auth: Auth;
}

/**
 * Lazily initializes and returns the Firebase App, Firestore, and Auth
 * instances. Returns `null` (rather than throwing) when called somewhere
 * that shouldn't touch Firebase at all — during SSR, or when config is
 * missing — so callers can fail soft instead of crashing a render.
 *
 * BROWSER-ONLY, DELIBERATELY: this app is server-rendered (TanStack Start /
 * server.ts / start.ts run server-side, targeting Cloudflare Workers via
 * Nitro). There is no `window`/`indexedDB` there, and Firestore's persistent
 * local cache requires IndexedDB. This guard mirrors the existing
 * `typeof window === "undefined"` pattern already used in src/lib/store.ts —
 * do not remove it or call this during SSR.
 *
 * NO FIREBASE ANALYTICS: getAnalytics() is deliberately never called. It has
 * no value for a 2-3 device internal ledger app, can throw during SSR or
 * inside a Capacitor WebView without extra native setup, and is one more
 * thing that could break offline behavior for no benefit here.
 *
 * OFFLINE PERSISTENCE: Firestore is configured with `persistentLocalCache`
 * using a *single*-tab manager. This app runs as either one Capacitor
 * WebView (a single process, not multiple browser tabs) or, on the desktop
 * PWA build, effectively one active install at a time — the multi-tab
 * manager exists for the "several browser tabs of the same web app open at
 * once" case, which doesn't apply here. Using persistentMultipleTabManager
 * unnecessarily would add complexity with no benefit.
 *
 * NOTE (perf, not correctness): the current `persistentLocalCache` API has a
 * known, still-open upstream performance regression vs. the older deprecated
 * `enableIndexedDbPersistence` API for cache reads (roughly 40ms vs 850ms in
 * one reported benchmark: firebase/firebase-js-sdk#7347). `persistentLocalCache`
 * is still the correct, currently-recommended API (the old one is
 * deprecated), and at this app's expected scale (one small shop, a few
 * hundred customers at most, dozens of entries each) that difference should
 * stay well under anything a user would notice — but worth knowing about if
 * the ledger UI ever feels sluggish after this migration.
 */
export function getFirebase(): FirebaseServices | null {
  if (typeof window === "undefined") return null;

  if (!app) {
    const { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId } = rawConfig;

    if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
      console.error(
        "[firebase] Missing VITE_FIREBASE_* config — Firebase was not initialized. " +
          "Copy .env.example to .env and fill in the real project values.",
      );
      return null;
    }

    app = initializeApp({ apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId });

    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentSingleTabManager(undefined),
      }),
    });

    auth = getAuth(app);
  }

  return { app, db: db!, auth: auth! };
}
