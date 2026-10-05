import * as React from "react";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import { ensureSignedIn } from "./auth";
import { SHOP_ID } from "./firestore-schema";

/**
 * Device identity + activity feed.
 *
 *  - Who is "this device"?  Its anonymous Firebase UID; its friendly name is
 *    the `devicename` field of the matching doc in shops/<shop>/allowedDevices
 *    (the docs you add by hand in the Firebase console).
 *  - Every history/activity entry written by the store is stamped with the
 *    writing device's UID (+ name, when known) -- see fsAddHistory in store.ts.
 *  - allowedDevices can't be written by the app (rules: write = false), so
 *    "last active" comes from a small heartbeat doc per device in the existing
 *    `settings` collection ("deviceseen_<uid>") plus the newest activity entry.
 */
const allowedCol = `shops/${SHOP_ID}/allowedDevices`;
const historyCol = `shops/${SHOP_ID}/history`;
const settingsCol = `shops/${SHOP_ID}/settings`;
const SEEN_PREFIX = "deviceseen_";

let cachedName: string | null = null;

/** Sync: what we know about this device right now (name may still be null). */
export function getCurrentDevice(): { uid: string | null; name: string | null } {
  const uid = getFirebase()?.auth.currentUser?.uid ?? null;
  return { uid, name: cachedName };
}

async function loadDeviceName(uid: string) {
  const services = getFirebase();
  if (!services) return;
  try {
    const snap = await getDoc(doc(services.db, `${allowedCol}/${uid}`));
    const d = snap.data() as { devicename?: string; name?: string } | undefined;
    cachedName = d?.devicename ?? d?.name ?? null;
  } catch (err) {
    console.error("[activity] could not read device name", err);
  }
}

/** Keeps "last active" fresh: on open, every 5 minutes, and when the app returns to the front. */
export function useDeviceHeartbeat() {
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const beat = async () => {
      const services = getFirebase();
      const uid = services?.auth.currentUser?.uid;
      if (!services || !uid || cancelled) return;
      try {
        await setDoc(doc(services.db, `${settingsCol}/${SEEN_PREFIX}${uid}`), {
          uid,
          at: new Date().toISOString(),
        });
      } catch (err) {
        console.error("[activity] heartbeat failed", err);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };

    (async () => {
      try {
        const user = await ensureSignedIn();
        if (!user || cancelled) return;
        await loadDeviceName(user.uid);
        await beat();
        timer = setInterval(() => void beat(), 5 * 60 * 1000);
        document.addEventListener("visibilitychange", onVisible);
      } catch (err) {
        console.error("[activity] heartbeat setup failed", err);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}

export interface DeviceInfo {
  uid: string;
  name: string;
  lastActive: string | null; // ISO
  isThisDevice: boolean;
}

export interface ActivityRow {
  id: string;
  at: string; // ISO
  text: string;
  deviceUid: string | null;
  deviceName: string | null;
}

export function useActivity() {
  const [allowed, setAllowed] = React.useState<{ uid: string; name: string }[]>([]);
  const [seen, setSeen] = React.useState<Record<string, string>>({});
  const [rows, setRows] = React.useState<ActivityRow[]>([]);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [myUid, setMyUid] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    (async () => {
      const services = getFirebase();
      if (!services) {
        setReady(true);
        return;
      }
      try {
        const user = await ensureSignedIn();
        setMyUid(user?.uid ?? null);
      } catch (err) {
        console.error("[activity] sign-in failed", err);
        setError("Could not sign in to load activity.");
        setReady(true);
        return;
      }
      if (cancelled) return;
      const fail = (what: string) => (err: unknown) => {
        console.error(`[activity] ${what} listener error`, err);
        setError(`Could not load ${what} (${(err as { code?: string })?.code ?? "error"}).`);
        setReady(true);
      };

      unsubs.push(
        onSnapshot(
          collection(services.db, allowedCol),
          (snap) => {
            if (cancelled) return;
            setAllowed(
              snap.docs.map((d) => {
                const v = d.data() as { devicename?: string; name?: string };
                return { uid: d.id, name: v.devicename ?? v.name ?? "" };
              }),
            );
          },
          fail("devices"),
        ),
      );

      unsubs.push(
        onSnapshot(
          collection(services.db, settingsCol),
          (snap) => {
            if (cancelled) return;
            const next: Record<string, string> = {};
            for (const d of snap.docs) {
              if (!d.id.startsWith(SEEN_PREFIX)) continue;
              const v = d.data() as { at?: string };
              if (v.at) next[d.id.slice(SEEN_PREFIX.length)] = v.at;
            }
            setSeen(next);
          },
          fail("last active times"),
        ),
      );

      unsubs.push(
        onSnapshot(
          query(collection(services.db, historyCol), orderBy("at", "desc"), limit(1500)),
          (snap) => {
            if (cancelled) return;
            setRows(
              snap.docs.map((d) => {
                const v = d.data({ serverTimestamps: "estimate" }) as {
                  at?: { toDate: () => Date };
                  text?: string;
                  deviceUid?: string;
                  deviceName?: string;
                };
                return {
                  id: d.id,
                  at: (v.at?.toDate ? v.at.toDate() : new Date()).toISOString(),
                  text: v.text ?? "",
                  deviceUid: v.deviceUid ?? null,
                  deviceName: v.deviceName ?? null,
                };
              }),
            );
            setReady(true);
          },
          fail("activity"),
        ),
      );
    })();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, []);

  /** Device list: every allowed device, plus any device seen in the log but no longer allowed. */
  const devices = React.useMemo<DeviceInfo[]>(() => {
    const newestActivity: Record<string, string> = {};
    for (const r of rows) {
      if (r.deviceUid && !newestActivity[r.deviceUid]) newestActivity[r.deviceUid] = r.at;
    }
    const byUid = new Map<string, string>(); // uid -> name
    for (const a of allowed) byUid.set(a.uid, a.name);
    for (const r of rows) {
      if (r.deviceUid && !byUid.has(r.deviceUid)) byUid.set(r.deviceUid, r.deviceName ?? "");
    }
    return [...byUid.entries()]
      .map(([uid, name]) => {
        const times = [seen[uid], newestActivity[uid]].filter(Boolean) as string[];
        const lastActive = times.length ? times.reduce((a, b) => (a > b ? a : b)) : null;
        return { uid, name: name || "Unnamed device", lastActive, isThisDevice: uid === myUid };
      })
      .sort((a, b) => (b.lastActive ?? "").localeCompare(a.lastActive ?? ""));
  }, [allowed, seen, rows, myUid]);

  return { devices, rows, ready, error };
}
