import * as React from "react";
import {
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
  updateDoc,
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
// NEW in Phase 3: real-time sync via onSnapshot listeners, replacing Phase
// 2's one-time getDocs()/getDoc() fetch. This supersedes and REMOVES the
// Phase-2-fix cache-fallback wrappers (getDocsWithCacheFallback /
// getDocWithCacheFallback) that used to live here -- they are no longer
// needed, and for a good, source-verified reason, not just because
// onSnapshot is "the Phase 3 thing to do":
//
// onSnapshot listeners are documented, reliable-by-design cache-first reads.
// Unlike a one-time getDocs()/getDoc() promise (which has to make a binary
// "resolve or reject" decision and, per the bug found and fixed after Phase
// 2, could unreliably throw instead of falling back on a cold start while
// offline), a snapshot listener's whole purpose is to hand back whatever it
// currently knows immediately -- cached data first if that's all that's
// available -- and then push updates as the truth changes. There is no
// equivalent "give up and reject" failure mode for the ordinary offline
// case, so the exact bug fixed after Phase 2 structurally cannot recur here.
// (The listener's error callback below is reserved for genuine, different
// failures -- e.g. a permission-denied from security rules -- not ordinary
// offline reads.)
//
// This directly delivers the brief's real-time requirement: two customers
// subcollections are independent Firestore documents (per the schema
// finalized in Phase 1), so if Phone A and Phone B are both offline and add
// different entries for the same customer, each queues locally; whichever
// comes online first flushes to Firestore; the OTHER phone's entries
// listener for that same customer then fires again with the merged result
// the next time it's online -- no custom merge/diff code needed, no
// overwrite risk, because neither phone was ever writing to a shared array.
//
// Soft-delete filtering stays client-side (deleted === true -> skip) for the
// same reason as before: a where("deleted","==",false) clause combined with
// the orderBy() below would need a composite index, and at this app's scale
// (a few hundred customers at most, dozens of entries each) filtering the
// small number of soft-deleted docs out client-side costs nothing
// meaningful.
// ---------------------------------------------------------------------------

/**
 * Sets up every real-time listener useAppStore() needs (customers, a
 * dynamically-managed fan-out of one entries listener per customer, history,
 * settings) and wires them into the given React state setters. Returns a
 * single cleanup function that tears down every listener -- call it from the
 * owning effect's cleanup.
 *
 * Structured as a synchronous function that kicks off async setup
 * internally (rather than an async function itself) because a React effect
 * callback must return its cleanup function synchronously; the `cancelled`
 * flag guards every callback against firing after cleanup has already run,
 * covering the case where the component unmounts (or this effect re-runs)
 * before the async sign-in/listener-setup has finished.
 */
function subscribeAppData(
  setData: React.Dispatch<React.SetStateAction<AppData>>,
  setReady: React.Dispatch<React.SetStateAction<boolean>>,
): () => void {
  let cancelled = false;
  const entriesUnsubs = new Map<string, Unsubscribe>();
  let customersUnsub: Unsubscribe | null = null;
  let historyUnsub: Unsubscribe | null = null;
  let settingsUnsub: Unsubscribe | null = null;

  function showEmptyFallback() {
    if (cancelled) return;
    setData({ ...defaultData, settings: { ...defaultData.settings, theme: loadLocalTheme() } });
    setReady(true);
  }

  async function start() {
    const services = getFirebase();
    if (!services) {
      showEmptyFallback(); // SSR, or missing VITE_FIREBASE_* config
      return;
    }

    try {
      await ensureSignedIn();
    } catch (err) {
      console.error("[store] Firebase sign-in failed; showing empty state", err);
      showEmptyFallback();
      return;
    }

    if (cancelled) return;
    const { db } = services;

    // Customers listener. Also owns the dynamic fan-out of per-customer
    // entries listeners: every time the customer LIST changes (a customer
    // added, soft-deleted, or otherwise no longer matching), it reconciles
    // which entries listeners should be active.
    customersUnsub = onSnapshot(
      query(collection(db, customersCollectionPath()), orderBy("createdAt", "desc")),
      (snap) => {
        if (cancelled) return;
        const currentIds = new Set<string>();

        // Customers, newest-created first -- CreditsScreen and ReportsScreen
        // both render store.data.customers directly with no re-sort of
        // their own, so this order has to be right at the source, same as
        // Phase 2. Preserves each customer's already-known `entries` (owned
        // by the separate per-customer listener below) rather than
        // resetting them to [] on every customer-list change.
        setData((d) => {
          const nextCustomers: Customer[] = [];
          for (const cSnap of snap.docs) {
            const cData = cSnap.data() as CustomerDoc;
            if (cData.deleted) continue;
            currentIds.add(cSnap.id);
            const existing = d.customers.find((c) => c.id === cSnap.id);
            nextCustomers.push({
              id: cSnap.id,
              name: cData.name,
              contact: cData.contact,
              paidMonths: cData.paidMonths ?? [],
              updatedAt: tsToIso(cData.updatedAt),
              entries: existing?.entries ?? [],
            });
          }
          return { ...d, customers: nextCustomers };
        });

        // Start an entries listener for any customer newly seen.
        for (const id of currentIds) {
          if (cancelled || entriesUnsubs.has(id)) continue;
          const unsub = onSnapshot(
            collection(db, entriesCollectionPath(id)),
            (eSnap) => {
              if (cancelled) return;
              // No orderBy here: LedgerScreen already sorts by date itself
              // before rendering (confirmed before writing this in Phase
              // 2), so listener delivery order doesn't matter.
              setData((d) => ({
                ...d,
                customers: d.customers.map((c) => {
                  if (c.id !== id) return c;
                  const entries: Entry[] = [];
                  for (const ed of eSnap.docs) {
                    const eData = ed.data() as EntryDoc;
                    if (eData.deleted) continue;
                    entries.push({
                      id: ed.id,
                      type: eData.type,
                      description: eData.description,
                      amount: paisaToRupees(eData.amountPaisa),
                      date: eData.date,
                    });
                  }
                  return { ...c, entries };
                }),
              }));
            },
            (err) => {
              console.error("[store] entries listener error for customer", id, err);
            },
          );
          entriesUnsubs.set(id, unsub);
        }

        // Stop listening to any customer no longer present (soft-deleted,
        // or otherwise gone) -- without this, entries listeners would leak
        // and keep firing for customers the UI no longer shows.
        for (const [id, unsub] of entriesUnsubs) {
          if (!currentIds.has(id)) {
            unsub();
            entriesUnsubs.delete(id);
          }
        }

        setReady(true);
      },
      (err) => {
        // Reserved for a genuine failure (e.g. permission-denied) -- see the
        // block comment above for why the ordinary offline case doesn't
        // reach here the way it could with the old one-time fetch.
        console.error("[store] customers listener error; showing empty state", err);
        showEmptyFallback();
      },
    );

    // History: newest first, capped at 500 -- same cap as Phase 2, now kept
    // continuously up to date instead of only as of the last page load.
    historyUnsub = onSnapshot(
      query(collection(db, historyCollectionPath()), orderBy("at", "desc"), limit(500)),
      (snap) => {
        if (cancelled) return;
        setData((d) => ({
          ...d,
          history: snap.docs.map((hd) => {
            const h = hd.data() as HistoryDoc;
            return { id: hd.id, at: tsToIso(h.at), text: h.text };
          }),
        }));
      },
      (err) => console.error("[store] history listener error", err),
    );

    // Settings: only `whatsapp` is remote/shared -- `theme` stays
    // device-local, same reasoning as Phase 2.
    settingsUnsub = onSnapshot(
      doc(db, settingsDocPath()),
      (snap) => {
        if (cancelled) return;
        const remote = snap.exists() ? (snap.data() as SettingsDoc) : null;
        setData((d) => ({
          ...d,
          settings: { ...d.settings, whatsapp: remote?.whatsapp ?? d.settings.whatsapp },
        }));
      },
      (err) => console.error("[store] settings listener error", err),
    );
  }

  void start();

  return () => {
    cancelled = true;
    customersUnsub?.();
    historyUnsub?.();
    settingsUnsub?.();
    for (const unsub of entriesUnsubs.values()) unsub();
    entriesUnsubs.clear();
  };
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
  // BUG FIX: theme is device-local (never synced via Firestore, by design --
  // see loadLocalTheme/saveLocalTheme above), and saving it always worked
  // (setSettings calls saveLocalTheme on every theme change) -- but RESTORING
  // it on a normal successful load did not. defaultData hardcodes theme to
  // "light", and every onSnapshot listener in subscribeAppData only ever
  // touches the fields it's actually responsible for (customers, history,
  // whatsapp), correctly leaving `settings.theme` untouched on every update
  // -- which is fine ONCE it starts correct, but nothing on the success path
  // ever called loadLocalTheme() to seed it in the first place. Only the
  // failure-path showEmptyFallback() did. Net effect: reloading always
  // silently reverted to "light" regardless of what was saved.
  //
  // Fix: seed the theme from localStorage in the initial state itself, via
  // useState's lazy-initializer form (a function, evaluated once on mount,
  // before the first paint) -- not a separate effect, so there's no extra
  // render/flash where the wrong theme is briefly shown before correcting.
  // loadLocalTheme() already safely returns the default during SSR (guarded
  // by `typeof window === "undefined"`), so this is SSR-safe unchanged.
  // Touches zero Firestore/listener code -- purely local initial state.
  const [data, setData] = React.useState<AppData>(() => ({
    ...defaultData,
    settings: { ...defaultData.settings, theme: loadLocalTheme() },
  }));
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
    return subscribeAppData(setData, setReady);
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
