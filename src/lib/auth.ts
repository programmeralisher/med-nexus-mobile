/**
 * Auth helpers for the migration. Deliberately standalone in Phase 1 — NOT
 * imported by Login.tsx or store.ts yet. Wiring this into the actual login
 * flow (persistent session, step-up password re-prompt for sensitive
 * actions) is a Phase 2/§6a concern once the data layer itself is
 * Firestore-backed. This file exists now so that shape is settled and
 * testable (see scripts/phase1-smoke-test.mjs) before Phase 2 depends on it.
 */
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { getFirebase } from "./firebase";

const DEVICE_ID_KEY = "zeeshan-medical-khatta-device-id";

/**
 * Stable, random ID generated once per install and persisted in
 * localStorage under its OWN key — deliberately separate from the existing
 * app data key (`zeeshan-medical-khatta-v1` in store.ts) so that migrating,
 * clearing, or resetting app data can never accidentally wipe or regenerate
 * a device's identity.
 *
 * This is diagnostic only (stamped onto EntryDoc.deviceId — see
 * firestore-schema.ts) and is NOT the same thing as the Firebase Auth UID
 * used for security rules. A phone could theoretically end up with a new
 * Auth UID (e.g. after a reinstall) while keeping the same deviceId, or vice
 * versa — that's fine, they serve different purposes and are not meant to
 * be kept in sync with each other.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";

  let id = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `device-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    window.localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Ensures the current device is signed in with Firebase Anonymous Auth,
 * resolving with the signed-in User. Firebase Auth persists its own session
 * in the browser/WebView by default, so on subsequent app opens this
 * resolves quickly from the existing session rather than creating a new
 * anonymous identity every time — which matters, because a new identity
 * would mean a new UID, which would need re-adding to the Firestore
 * allowlist (see firestore.rules) every single time.
 *
 * Returns null in the same situations getFirebase() does (SSR, missing
 * config) rather than throwing, so callers can fail soft.
 */
export async function ensureSignedIn(): Promise<User | null> {
  const services = getFirebase();
  if (!services) return null;

  const { auth } = services;

  // If a session is already restored, don't call signInAnonymously again —
  // that would be wasteful (and, prior to Firebase Auth resolving its
  // persisted session on startup, could race and momentarily look
  // "signed out" when it isn't).
  const existing = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
  if (existing) return existing;

  const cred = await signInAnonymously(auth);
  return cred.user;
}
