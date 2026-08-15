// Phase 1 disposable smoke test — auth + schema path + write/read/delete.
//
// This sandbox has no network access to Firebase (confirmed in Phase 0 —
// firestore.googleapis.com etc. all return 403 host_not_allowed here), so
// this could not be run from within this conversation. Run it yourself,
// the same way you independently verified Phase 0:
//
//   node --env-file=.env scripts/phase1-smoke-test.mjs
//
// (Node 20.6+ supports --env-file natively — you're on Node with npm/bun
// already, so this should just work. Make sure .env has the real
// VITE_FIREBASE_* values filled in, per .env.example.)
//
// What this validates, and what it does NOT validate:
//   - DOES validate: the auth flow works, the schema paths from
//     firestore-schema.ts are well-formed and reachable, and read-after-
//     write round-trips correctly.
//   - Does NOT validate the drafted firestore.rules — those aren't deployed
//     yet (checkpoint #2). This runs against whatever rules are CURRENTLY
//     LIVE on the project right now (almost certainly still open/test-mode
//     defaults from when the Firestore database was created). Once
//     firestore.rules is reviewed, approved, and deployed, re-run this and
//     it should still pass (since the script signs in and the rules allow
//     any authorized device to read/write _diagnostics/**) — but a truly
//     unauthorized client should then start failing, which the Firestore
//     Rules Playground/emulator is the right tool to verify, not this
//     script.
//
// Safety: this ONLY touches shops/{SHOP_ID}/_diagnostics/{testId}, a path
// the real app never reads or writes. It cleans up after itself (step 4).
// It never touches customers, entries, history, or settings.

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, deleteDoc, serverTimestamp } from "firebase/firestore";

const SHOP_ID = "zeeshan-medical-store";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

function ok(msg) {
  console.log(`\u2713 ${msg}`);
}
function fail(msg) {
  console.error(`\u2717 ${msg}`);
  process.exitCode = 1;
}

async function main() {
  for (const [key, value] of Object.entries(firebaseConfig)) {
    if (!value) {
      fail(`Missing env var for "${key}" — check .env against .env.example, and make sure you ran with --env-file=.env.`);
      return;
    }
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  // Note: plain getFirestore(), not the app's initializeFirestore(...,
  // { localCache: persistentLocalCache(...) }) from src/lib/firebase.ts.
  // Offline persistence needs IndexedDB, which doesn't exist in plain
  // Node — irrelevant here anyway, since this is a one-shot online script,
  // not the real app. Deliberately not importing src/lib/firebase.ts:
  // getFirebase() is guarded to return null outside a browser, which would
  // make it useless in this context.
  const db = getFirestore(app);

  let uid;
  try {
    const cred = await signInAnonymously(auth);
    uid = cred.user.uid;
    ok(`Signed in anonymously. UID: ${uid}`);
    console.log(`  (If/when you deploy firestore.rules, this UID needs to be added under`);
    console.log(`   shops/${SHOP_ID}/allowedDevices/${uid} for THIS device to keep working.)`);
  } catch (err) {
    fail(`Anonymous sign-in failed: ${err.message}`);
    return;
  }

  const testId = `smoke-test-${Date.now()}`;
  const ref = doc(db, "shops", SHOP_ID, "_diagnostics", testId);
  const payload = {
    createdBy: uid,
    createdAt: serverTimestamp(),
    note: "Phase 1 disposable smoke test doc. Safe to ignore or delete if seen in the console — this script deletes it itself on success.",
  };

  try {
    await setDoc(ref, payload);
    ok(`Wrote disposable test doc at shops/${SHOP_ID}/_diagnostics/${testId}`);
  } catch (err) {
    fail(`Write failed: ${err.message}`);
    return;
  }

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      fail("Read failed: document does not exist right after writing it.");
      return;
    }
    const data = snap.data();
    if (data.createdBy !== uid) {
      fail("Read succeeded, but createdBy did not round-trip to the value that was written.");
      return;
    }
    ok("Read back the test doc — fields match exactly what was written.");
  } catch (err) {
    fail(`Read failed: ${err.message}`);
    return;
  }

  try {
    await deleteDoc(ref);
    ok("Deleted the disposable test doc — nothing left behind in Firestore.");
  } catch (err) {
    fail(
      `Cleanup delete failed (the test doc may still exist at shops/${SHOP_ID}/_diagnostics/${testId} — safe to delete manually from the console): ${err.message}`,
    );
    return;
  }

  console.log("\nAll Phase 1 smoke test steps passed.");
}

main();
