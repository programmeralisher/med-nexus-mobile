import * as React from "react";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import { ensureSignedIn, getDeviceId } from "./auth";
import {
  customerDocPath,
  customersCollectionPath,
  entriesCollectionPath,
  entryDocPath,
  historyCollectionPath,
  historyDocPath,
  paisaToRupees,
  rupeesToPaisa,
  settingsDocPath,
  type CustomerDoc,
  type EntryDoc,
  type HistoryDoc,
  type SettingsDoc,
} from "./firestore-schema";

// ---------------------------------------------------------------------------
// UNCHANGED from before Phase 2: every type, and every pure function that is
// part of the app's money/formatting/business logic. Byte-for-byte identical
// to the pre-migration version -- only their DATA SOURCE changes, further
// down in this file.
// ---------------------------------------------------------------------------

export type EntryType = "item" | "payment";

export interface Entry {
  id: string;
  type: EntryType;
  description: string;
  amount: number;
  date: string; // ISO
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  entries: Entry[];
  paidMonths: string[]; // e.g. "2026-08"
  updatedAt: string; // ISO
}

export interface HistoryItem {
  id: string;
  at: string;
  text: string;
}

export interface Settings {
  theme: "light" | "dark";
  whatsapp: string;
}

export interface AppData {
  customers: Customer[];
  history: HistoryItem[];
  settings: Settings;
}

/**
 * Legacy localStorage key from the pre-Firestore version of this app. No
 * longer read or written by useAppStore() -- Firestore (with its own
 * IndexedDB-backed offline cache, configured in firebase.ts) is now the
 * single source of truth. Left defined (unused by this file) only as a
 * reference for a possible future one-time migration script -- see the
 * brief's Phase 7. Confirmed via git diff against the pre-Phase-2 commit
 * that no real data has ever been written under this key by this app in
 * production, per the "no real customer/ledger data exists yet" note from
 * the brief.
 */
const KEY = "zeeshan-medical-khatta-v1";

export const STORE_PASSWORD = "store123";

const defaultData: AppData = {
  customers: [],
  history: [],
  settings: { theme: "light", whatsapp: "" },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const monthKey = (d: Date | string = new Date()) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const fmtMoney = (n: number) =>
  "Rs " + Math.round(n).toLocaleString("en-PK", { maximumFractionDigits: 0 });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const balanceOf = (c: Customer) =>
  c.entries.reduce((s, e) => s + (e.type === "item" ? e.amount : -e.amount), 0);

export const paidTotalOf = (c: Customer) =>
  c.entries.filter((e) => e.type === "payment").reduce((s, e) => s + e.amount, 0);

export const lastPaymentOf = (c: Customer) =>
  c.entries
    .filter((e) => e.type === "payment")
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];

// ---------------------------------------------------------------------------
// NEW in Phase 2: device-local theme persistence. `theme` is deliberately
// NOT synced to Firestore (unlike `whatsapp`, which is real shared shop
// data) -- see the OPEN QUESTION comment on SettingsDoc in firestore-schema.ts.
// Pre-migration, theme was already effectively device-local (each phone's
// browser had its own isolated localStorage, so one phone's dark-mode toggle
// never affected another). Syncing it now would be a NEW cross-device
// behavior nobody asked for, so it keeps its own small local-only key
// instead, separate from the legacy whole-blob KEY above.
// ---------------------------------------------------------------------------

const THEME_KEY = "zeeshan-medical-khatta-theme";

function loadLocalTheme(): Settings["theme"] {
  if (typeof window === "undefined") return defaultData.settings.theme;
  const v = window.localStorage.getItem(THEME_KEY);
  return v === "dark" || v === "light" ? v : defaultData.settings.theme;
}

function saveLocalTheme(theme: Settings["theme"]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Best-effort only -- worst case, theme just doesn't persist across a
    // reload on this device. Never something to surface to the shop owner.
  }
}

/** Firestore Timestamp -> ISO string, with a safe fallback for the rare case
 * of reading a doc whose serverTimestamp() sentinel hasn't resolved yet. */
function tsToIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// FIX (found during Phase 2 offline testing): Firestore's default getDocs()/
// getDoc() are documented as "network first, fall back to cache if offline"
// -- but that fallback has been unreliable in the Firestore Web SDK for
// years, specifically for a COLD START while already offline (load the page
// fresh with no network -- exactly what was tested): the first read issued
// in a fresh client session can throw "Failed to get document because the
// client is offline" instead of silently falling back, even with data
// already sitting in the persistentLocalCache (IndexedDB) configured in
// firebase.ts. This is a known, long-standing SDK behavior, not a bug in
// this app's Firestore configuration or in how firebase.ts sets up the
// cache -- see firebase/firebase-js-sdk issues #3207, #5836, #6036 (and
// still-open related reports), spanning multiple SDK versions and years.
//
// The reliable fix, without introducing onSnapshot listeners (real-time
// sync is explicitly Phase 3, not touched here): catch that specific
// failure and explicitly retry with the *FromCache variant of the same
// read. getDocFromCache/getDocsFromCache are stable, documented, non-
// experimental Firestore APIs that read ONLY from the same
// persistentLocalCache -- never touching the network at all -- so they
// can't hit the same "is it really offline or just slow" ambiguity that
// causes the default call to sometimes throw instead of falling back.
//
// The default (network-first) call is always tried FIRST here -- this
// fallback only ever engages on an actual failure, so all existing online
// behavior is completely unchanged when the network is actually up.
// ---------------------------------------------------------------------------

async function getDocsWithCacheFallback(
  q: Query<DocumentData>,
): Promise<QuerySnapshot<DocumentData>> {
  try {
    return await getDocs(q);
  } catch (err) {
    console.warn(
      "[store] getDocs failed (likely offline) -- falling back to local Firestore cache",
      err,
    );
    return await getDocsFromCache(q);
  }
}

async function getDocWithCacheFallback(
  ref: DocumentReference<DocumentData>,
): Promise<DocumentSnapshot<DocumentData>> {
  try {
    return await getDoc(ref);
  } catch (err) {
    console.warn(
      "[store] getDoc failed (likely offline) -- falling back to local Firestore cache",
      err,
    );
    return await getDocFromCache(ref);
  }
}

// ---------------------------------------------------------------------------
// NEW in Phase 2: read the whole AppData from Firestore. One-time fetch on
// mount, matching the exact one-time-load pattern the old localStorage
// version had (real-time onSnapshot listeners are explicitly Phase 3 --
// "Real-time sync" -- not this phase). Firestore's own persistentLocalCache
// (configured in firebase.ts, Phase 0) means this still resolves from the
// local cache when offline, once something has been cached at least once --
// reliably so now, via the cache-fallback wrappers just above.
//
// Deliberately does the soft-delete filter (deleted === true -> skip) in
// plain JS after fetching, rather than a Firestore where("deleted","==",
// false) clause -- a where() clause combined with the orderBy() below would
// need a composite index; filtering client-side avoids that entirely for
// now. At this app's scale (audit estimate: a few hundred customers at most,
// dozens of entries each) fetching the small number of soft-deleted docs
// too and discarding them client-side is not a meaningful cost.
// ---------------------------------------------------------------------------

async function fetchAppData(): Promise<AppData> {
  const localTheme = loadLocalTheme();
  const fallback: AppData = {
    ...defaultData,
    settings: { ...defaultData.settings, theme: localTheme },
  };

  const services = getFirebase();
  if (!services) return fallback; // SSR, or missing VITE_FIREBASE_* config

  try {
    await ensureSignedIn();
  } catch (err) {
    console.error("[store] Firebase sign-in failed; showing empty state", err);
    return fallback;
  }

  const { db } = services;

  try {
    // Customers, newest-created first -- CreditsScreen and ReportsScreen both
    // render store.data.customers directly with no re-sort of their own, so
    // this order has to be right at the source. The old localStorage version
    // got this order "for free" by always prepending new customers to the
    // front of the array; a single-field orderBy replicates that without
    // needing a composite index.
    const customersSnap = await getDocsWithCacheFallback(
      query(collection(db, customersCollectionPath()), orderBy("createdAt", "desc")),
    );

    const customers: Customer[] = [];
    for (const cSnap of customersSnap.docs) {
      const cData = cSnap.data() as CustomerDoc;
      if (cData.deleted) continue;

      // Entries subcollection for this one customer. No orderBy needed here:
      // LedgerScreen already does [...c.entries].sort((a,b) => date) itself
      // before rendering, so fetch order genuinely doesn't affect anything --
      // confirmed by reading LedgerScreen.tsx line 41 before writing this.
      const entriesSnap = await getDocsWithCacheFallback(
        collection(db, entriesCollectionPath(cSnap.id)),
      );
      const entries: Entry[] = [];
      for (const eSnap of entriesSnap.docs) {
        const eData = eSnap.data() as EntryDoc;
        if (eData.deleted) continue;
        entries.push({
          id: eSnap.id,
          type: eData.type,
          description: eData.description,
          amount: paisaToRupees(eData.amountPaisa),
          date: eData.date,
        });
      }

      customers.push({
        id: cSnap.id,
        name: cData.name,
        contact: cData.contact,
        entries,
        paidMonths: cData.paidMonths ?? [],
        updatedAt: tsToIso(cData.updatedAt),
      });
    }

    // History: newest first, capped at 500 -- matches the old
    // .slice(0, 500) cap exactly, just enforced via the query instead.
    const historySnap = await getDocsWithCacheFallback(
      query(collection(db, historyCollectionPath()), orderBy("at", "desc"), limit(500)),
    );
    const history: HistoryItem[] = historySnap.docs.map((d) => {
      const h = d.data() as HistoryDoc;
      return { id: d.id, at: tsToIso(h.at), text: h.text };
    });

    const settingsSnap = await getDocWithCacheFallback(doc(db, settingsDocPath()));
    const remote = settingsSnap.exists() ? (settingsSnap.data() as SettingsDoc) : null;

    return {
      customers,
      history,
      settings: {
        theme: localTheme, // device-local, never from Firestore -- see above
        whatsapp: remote?.whatsapp ?? defaultData.settings.whatsapp,
      },
    };
  } catch (err) {
    // Reaching here means even the *FromCache fallback failed too (e.g. a
    // genuinely fresh install that's never synced anything while offline --
    // nothing to show is correct in that specific case). Any scenario where
    // data WAS previously cached is handled by the fallback wrappers above,
    // before it ever gets here.
    console.error(
      "[store] Firestore read failed even after cache fallback; showing empty state",
      err,
    );
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// NEW in Phase 2: one small, targeted Firestore write per mutation -- never a
// whole-AppData-blob overwrite (that whole-blob-on-every-change pattern was
// audit Risk #3, exactly what this migration exists to fix). Every one of
// these fails soft: it logs and returns, never throws into the caller. The
// optimistic local setData() call (in each mutator below) is already what
// the UI is showing by the time these run -- a failed background sync is a
// "will retry / needs investigation" situation, not a reason to interrupt
// whatever the shop owner is doing.
//
// deviceId (auth.ts) is stamped on every entry write, diagnostic-only, per
// firestore-schema.ts -- never read back into the UI anywhere in this file.
// ---------------------------------------------------------------------------

async function fsCreateCustomer(customerId: string, name: string, contact: string) {
  const services = getFirebase();
  if (!services) return;
  try {
    await setDoc(doc(services.db, customerDocPath(customerId)), {
      name,
      contact,
      paidMonths: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deleted: false,
      deletedAt: null,
    });
  } catch (err) {
    console.error("[store] Firestore: create customer failed", customerId, err);
  }
}

/** Soft delete only -- never a real Firestore document delete. The drafted
 * firestore.rules (Phase 1) enforce allow delete: if false on this
 * collection, so a real delete call here would be rejected anyway once
 * those rules are live; this keeps the client's own behavior consistent
 * with that, closing audit Risk #2 (delete-vs-concurrent-offline-edit). */
async function fsSoftDeleteCustomer(customerId: string) {
  const services = getFirebase();
  if (!services) return;
  try {
    await updateDoc(doc(services.db, customerDocPath(customerId)), {
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[store] Firestore: soft-delete customer failed", customerId, err);
  }
}

async function fsTouchCustomer(customerId: string) {
  const services = getFirebase();
  if (!services) return;
  try {
    await updateDoc(doc(services.db, customerDocPath(customerId)), {
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[store] Firestore: touch customer failed", customerId, err);
  }
}

async function fsCreateEntry(customerId: string, entryId: string, entry: Omit<Entry, "id">) {
  const services = getFirebase();
  if (!services) return;
  try {
    await setDoc(doc(services.db, entryDocPath(customerId, entryId)), {
      type: entry.type,
      description: entry.description,
      amountPaisa: rupeesToPaisa(entry.amount),
      date: entry.date,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deviceId: getDeviceId(),
      deleted: false,
      deletedAt: null,
    });
  } catch (err) {
    console.error("[store] Firestore: create entry failed", customerId, entryId, err);
  }
}

async function fsUpdateEntry(customerId: string, entryId: string, patch: Partial<Entry>) {
  const services = getFirebase();
  if (!services) return;
  const fsPatch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.description !== undefined) fsPatch["description"] = patch.description;
  if (patch.amount !== undefined) fsPatch["amountPaisa"] = rupeesToPaisa(patch.amount);
  if (patch.date !== undefined) fsPatch["date"] = patch.date;
  if (patch.type !== undefined) fsPatch["type"] = patch.type;
  try {
    await updateDoc(doc(services.db, entryDocPath(customerId, entryId)), fsPatch);
  } catch (err) {
    console.error("[store] Firestore: update entry failed", customerId, entryId, err);
  }
}

/** Soft delete only -- same reasoning as fsSoftDeleteCustomer, above. */
async function fsSoftDeleteEntry(customerId: string, entryId: string) {
  const services = getFirebase();
  if (!services) return;
  try {
    await updateDoc(doc(services.db, entryDocPath(customerId, entryId)), {
      deleted: true,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[store] Firestore: soft-delete entry failed", customerId, entryId, err);
  }
}

/** arrayUnion is a server-side atomic add -- safe if two devices mark the
 * same or different months paid for the same customer while both offline;
 * neither write can clobber the other the way a read-modify-write of the
 * whole array could. */
async function fsMarkPaid(customerId: string, month: string) {
  const services = getFirebase();
  if (!services) return;
  try {
    await updateDoc(doc(services.db, customerDocPath(customerId)), {
      paidMonths: arrayUnion(month),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[store] Firestore: mark paid failed", customerId, month, err);
  }
}

async function fsUpdateSharedSettings(patch: Partial<Pick<SettingsDoc, "whatsapp">>) {
  const services = getFirebase();
  if (!services) return;
  try {
    await setDoc(doc(services.db, settingsDocPath()), patch, { merge: true });
  } catch (err) {
    console.error("[store] Firestore: update settings failed", err);
  }
}

async function fsAddHistory(historyId: string, text: string) {
  const services = getFirebase();
  if (!services) return;
  try {
    await setDoc(doc(services.db, historyDocPath(historyId)), { text, at: serverTimestamp() });
  } catch (err) {
    console.error("[store] Firestore: add history failed", historyId, err);
  }
}

// ---------------------------------------------------------------------------
// useAppStore() -- same external shape as before Phase 2:
// { data, ready, addCustomer, deleteCustomer, addEntry, editEntry,
//   removeEntry, markPaid, setSettings, log }. No component needs to change
// how it calls this hook.
// ---------------------------------------------------------------------------

export function useAppStore() {
  const [data, setData] = React.useState<AppData>(defaultData);
  const [ready, setReady] = React.useState(false);

  // Always mirrors the latest rendered data, updated synchronously during
  // render (not via an effect) so mutators can read the CURRENT customer
  // list synchronously for a Firestore write's text (e.g. a customer's name
  // for a history entry) without depending on React state-updater timing --
  // see addCustomer/deleteCustomer below for why this is needed now that
  // there's a real async write alongside the optimistic local update.
  const dataRef = React.useRef(data);
  dataRef.current = data;

  React.useEffect(() => {
    let cancelled = false;
    fetchAppData().then((d) => {
      if (cancelled) return;
      setData(d);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("dark", data.settings.theme === "dark");
  }, [data.settings.theme, ready]);

  const log = React.useCallback((text: string) => {
    const id = uid();
    const at = new Date().toISOString();
    setData((d) => ({ ...d, history: [{ id, at, text }, ...d.history].slice(0, 500) }));
    void fsAddHistory(id, text);
  }, []);

  const updateCustomer = React.useCallback((id: string, fn: (c: Customer) => Customer) => {
    setData((d) => ({
      ...d,
      customers: d.customers.map((c) =>
        c.id === id ? { ...fn(c), updatedAt: new Date().toISOString() } : c,
      ),
    }));
  }, []);

  const api = React.useMemo(
    () => ({
      addCustomer(name: string, contact: string) {
        const c: Customer = {
          id: uid(),
          name,
          contact,
          entries: [],
          paidMonths: [],
          updatedAt: new Date().toISOString(),
        };
        setData((d) => ({ ...d, customers: [c, ...d.customers] }));
        log(`Created new ledger for ${name}`);
        void fsCreateCustomer(c.id, name, contact);
        return c;
      },
      deleteCustomer(id: string) {
        const name = dataRef.current.customers.find((x) => x.id === id)?.name;
        setData((d) => {
          const c = d.customers.find((x) => x.id === id);
          return {
            ...d,
            customers: d.customers.filter((x) => x.id !== id),
            history: c
              ? [
                  { id: uid(), at: new Date().toISOString(), text: `Deleted ledger of ${c.name}` },
                  ...d.history,
                ]
              : d.history,
          };
        });
        void fsSoftDeleteCustomer(id);
        if (name) void fsAddHistory(uid(), `Deleted ledger of ${name}`);
      },
      addEntry(customerId: string, entry: Omit<Entry, "id">) {
        const e: Entry = { ...entry, id: uid() };
        updateCustomer(customerId, (c) => ({ ...c, entries: [...c.entries, e] }));
        const name = dataRef.current.customers.find((c) => c.id === customerId)?.name ?? "";
        const historyText =
          entry.type === "payment"
            ? `Recorded payment ${fmtMoney(entry.amount)} in ${name}'s ledger`
            : `Added "${entry.description}" ${fmtMoney(entry.amount)} in ${name}'s ledger`;
        setData((d) => ({
          ...d,
          history: [{ id: uid(), at: new Date().toISOString(), text: historyText }, ...d.history],
        }));
        void fsCreateEntry(customerId, e.id, entry);
        void fsTouchCustomer(customerId);
        void fsAddHistory(uid(), historyText);
      },
      editEntry(customerId: string, entryId: string, patch: Partial<Entry>) {
        updateCustomer(customerId, (c) => ({
          ...c,
          entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
        }));
        void fsUpdateEntry(customerId, entryId, patch);
        void fsTouchCustomer(customerId);
      },
      removeEntry(customerId: string, entryId: string) {
        updateCustomer(customerId, (c) => ({
          ...c,
          entries: c.entries.filter((e) => e.id !== entryId),
        }));
        log(`Erased an entry from a ledger`);
        void fsSoftDeleteEntry(customerId, entryId);
        void fsTouchCustomer(customerId);
      },
      markPaid(customerId: string, month: string) {
        updateCustomer(customerId, (c) => ({
          ...c,
          paidMonths: c.paidMonths.includes(month) ? c.paidMonths : [...c.paidMonths, month],
        }));
        log(`Marked ${month} as paid`);
        void fsMarkPaid(customerId, month);
      },
      setSettings(patch: Partial<Settings>) {
        setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
        if (patch.theme !== undefined) saveLocalTheme(patch.theme);
        if (patch.whatsapp !== undefined) void fsUpdateSharedSettings({ whatsapp: patch.whatsapp });
      },
      log,
    }),
    [log, updateCustomer],
  );

  return { data, ready, ...api };
}

export type Store = ReturnType<typeof useAppStore>;
