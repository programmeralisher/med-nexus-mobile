import * as React from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { ensureSignedIn } from "./auth";
import { SHOP_ID, paisaToRupees, rupeesToPaisa } from "./firestore-schema";

/**
 * Personal "Stock" list -- items the shop owner tracks for his own reference.
 * Completely separate from customers, credit, recovery, reports and backups.
 *
 * LOCAL-FIRST: every change is applied and saved on this phone immediately
 * (localStorage), so the list always works and survives refresh -- even if the
 * cloud is unreachable or this device isn't approved for sync yet. Each change
 * is also mirrored to Firestore (`settings` collection, ids "stock_<id>" for
 * items and "stocktag_<slug>" for custom tags; no rules change needed). When
 * the cloud is reachable, remote changes are merged in (newest updatedAt wins)
 * and anything this phone has that the cloud lacks is pushed up. If the cloud
 * rejects something, a message says so instead of failing silently.
 */
export interface StockTag {
  id: string;
  name: string;
  /** Packet tags ask for tablets-per-packet and compute the per-tablet price. */
  packet: boolean;
  builtin: boolean;
}

export interface StockItem {
  id: string;
  tagId: string;
  name: string;
  tabletsPerPacket: number | null;
  price: number | null; // packet price for packet tags, plain price otherwise
  quantity: number | null;
  notes: string;
  available: boolean;
  updatedAt: string;
}

export type StockInput = Omit<StockItem, "id" | "updatedAt">;

export const BUILTIN_TAGS: StockTag[] = [
  { id: "tablet", name: "Tablet", packet: true, builtin: true },
  { id: "syrup", name: "Syrup", packet: false, builtin: true },
];

interface Rec {
  tagId?: string;
  name?: string;
  tabletsPerPacket?: number | null;
  pricePaisa?: number | null;
  quantity?: number | null;
  notes?: string;
  available?: boolean;
  packet?: boolean;
  updatedAt: string;
  deleted: boolean;
}
type Recs = Record<string, Rec>;

const ITEM_PREFIX = "stock_";
const TAG_PREFIX = "stocktag_";
const LOCAL_KEY = "zeeshan-stock-v1";
const settingsCol = `shops/${SHOP_ID}/settings`;

/** "Cefim 200mg" and "cefim  200 mg" are the same item. */
export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Per-tablet price, or null when it can't be worked out. */
export function perTablet(item: StockItem): number | null {
  if (item.price == null || !item.tabletsPerPacket || item.tabletsPerPacket <= 0) return null;
  return Math.round((item.price * 100) / item.tabletsPerPacket) / 100;
}

function loadLocal(): Recs {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Recs) : {};
  } catch {
    return {};
  }
}

function saveLocal(recs: Recs) {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(recs));
  } catch (err) {
    console.error("[stock] local save failed", err);
  }
}

/** Firestore rejects `undefined`; drop it. */
function clean(rec: Rec): Rec {
  return Object.fromEntries(
    Object.entries(rec).filter(([, v]) => v !== undefined),
  ) as unknown as Rec;
}

function describeError(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? "";
  if (code.includes("unavailable")) return null; // just offline -- not a problem
  const uid = getFirebase()?.auth.currentUser?.uid;
  if (code.includes("permission-denied")) {
    return (
      "Cloud sync is blocked: this device isn't approved yet (permission denied). " +
      "Your stock is saved on this phone only." +
      (uid ? ` Device ID to approve in allowedDevices: ${uid}` : "")
    );
  }
  return `Cloud sync problem (${code || "unknown"}). Your stock is saved on this phone only.`;
}

export function useStock() {
  const [recs, setRecs] = React.useState<Recs>({});
  const [ready, setReady] = React.useState(false);
  const [listenErr, setListenErr] = React.useState<string | null>(null);
  const [writeErr, setWriteErr] = React.useState<string | null>(null);
  const recsRef = React.useRef<Recs>({});
  const inflight = React.useRef<Set<string>>(new Set());

  const commit = React.useCallback((next: Recs) => {
    recsRef.current = next;
    saveLocal(next);
    setRecs(next);
  }, []);

  const writeRemote = React.useCallback((id: string, rec: Rec) => {
    const services = getFirebase();
    if (!services) return;
    const key = `${id}@${rec.updatedAt}`;
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    setDoc(doc(services.db, `${settingsCol}/${id}`), clean(rec), { merge: true })
      .then(() => setWriteErr(null))
      .catch((err) => {
        console.error("[stock] cloud write failed", err);
        setWriteErr(describeError(err));
      })
      .finally(() => inflight.current.delete(key));
  }, []);

  const put = React.useCallback(
    (id: string, fields: Partial<Rec>) => {
      const rec: Rec = {
        ...recsRef.current[id],
        ...fields,
        deleted: fields.deleted ?? false,
        updatedAt: new Date().toISOString(),
      };
      commit({ ...recsRef.current, [id]: rec });
      writeRemote(id, rec);
    },
    [commit, writeRemote],
  );

  React.useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    commit(loadLocal());
    setReady(true);

    (async () => {
      const services = getFirebase();
      if (!services) return;
      try {
        await ensureSignedIn();
      } catch (err) {
        console.error("[stock] sign-in failed", err);
        return;
      }
      if (cancelled) return;
      unsub = onSnapshot(
        collection(services.db, settingsCol),
        (snap) => {
          if (cancelled) return;
          setListenErr(null);
          const next: Recs = { ...recsRef.current };
          const remoteIds = new Set<string>();
          const toPush: string[] = [];
          let changed = false;
          for (const d of snap.docs) {
            if (!d.id.startsWith(ITEM_PREFIX) && !d.id.startsWith(TAG_PREFIX)) continue;
            remoteIds.add(d.id);
            const r = d.data() as Partial<Rec>;
            const remote: Rec = { ...r, updatedAt: r.updatedAt ?? "", deleted: r.deleted === true };
            const local = next[d.id];
            if (!local || remote.updatedAt >= local.updatedAt) {
              if (JSON.stringify(local) !== JSON.stringify(remote)) {
                next[d.id] = remote;
                changed = true;
              }
            } else {
              toPush.push(d.id); // this phone has a newer version
            }
          }
          if (!snap.metadata.fromCache) {
            // Things this phone has that the cloud has never seen.
            for (const [id, rec] of Object.entries(next)) {
              if (!remoteIds.has(id) && !rec.deleted) toPush.push(id);
            }
          }
          if (changed) commit(next);
          for (const id of toPush) {
            const rec = recsRef.current[id];
            if (rec) writeRemote(id, rec);
          }
        },
        (err) => {
          console.error("[stock] listener error", err);
          setListenErr(describeError(err));
        },
      );
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [commit, writeRemote]);

  const items = React.useMemo<StockItem[]>(() => {
    const out: StockItem[] = [];
    for (const [id, r] of Object.entries(recs)) {
      if (!id.startsWith(ITEM_PREFIX) || r.deleted) continue;
      out.push({
        id,
        tagId: r.tagId ?? "tablet",
        name: r.name ?? "",
        tabletsPerPacket: typeof r.tabletsPerPacket === "number" ? r.tabletsPerPacket : null,
        price: typeof r.pricePaisa === "number" ? paisaToRupees(r.pricePaisa) : null,
        quantity: typeof r.quantity === "number" ? r.quantity : null,
        notes: r.notes ?? "",
        available: r.available !== false,
        updatedAt: r.updatedAt,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [recs]);

  const tags = React.useMemo<StockTag[]>(() => {
    const custom: StockTag[] = [];
    for (const [id, r] of Object.entries(recs)) {
      if (!id.startsWith(TAG_PREFIX) || r.deleted) continue;
      custom.push({ id, name: r.name ?? "", packet: r.packet === true, builtin: false });
    }
    custom.sort((a, b) => a.name.localeCompare(b.name));
    return [...BUILTIN_TAGS, ...custom];
  }, [recs]);

  /** Returns an error message, or null when saved. `id` = editing that item. */
  const saveItem = React.useCallback(
    (input: StockInput, id?: string): string | null => {
      const name = input.name.trim().replace(/\s+/g, " ");
      if (!name) return "Item name is required";
      const key = normName(name);
      for (const [rid, r] of Object.entries(recsRef.current)) {
        if (!rid.startsWith(ITEM_PREFIX) || r.deleted || rid === id) continue;
        if (r.tagId === input.tagId && normName(r.name ?? "") === key) {
          return `"${name}" is already in the list`;
        }
      }
      const docId =
        id ?? ITEM_PREFIX + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      put(docId, {
        tagId: input.tagId,
        name,
        tabletsPerPacket: input.tabletsPerPacket,
        pricePaisa: input.price == null ? null : rupeesToPaisa(input.price),
        quantity: input.quantity,
        notes: input.notes.trim(),
        available: input.available,
      });
      return null;
    },
    [put],
  );

  const removeItem = React.useCallback((id: string) => put(id, { deleted: true }), [put]);

  const setAvailable = React.useCallback(
    (id: string, available: boolean) => put(id, { available }),
    [put],
  );

  /** Returns an error message, or the new tag's id. */
  const addTag = React.useCallback(
    (rawName: string, packet: boolean): { error?: string; id?: string } => {
      const name = rawName.trim().replace(/\s+/g, " ");
      if (!name) return { error: "Tag name is required" };
      const all = [
        ...BUILTIN_TAGS.map((t) => t.name),
        ...Object.entries(recsRef.current)
          .filter(([id, r]) => id.startsWith(TAG_PREFIX) && !r.deleted)
          .map(([, r]) => r.name ?? ""),
      ];
      if (all.some((n) => normName(n) === normName(name))) {
        return { error: `Tag "${name}" already exists` };
      }
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const id = TAG_PREFIX + (slug || Math.random().toString(36).slice(2, 8));
      put(id, { name, packet });
      return { id };
    },
    [put],
  );

  /** A tag can only go when no item uses it. */
  const removeTag = React.useCallback(
    (id: string): string | null => {
      const used = Object.entries(recsRef.current).some(
        ([rid, r]) => rid.startsWith(ITEM_PREFIX) && !r.deleted && r.tagId === id,
      );
      if (used) return "Delete or move the items under this tag first";
      put(id, { deleted: true });
      return null;
    },
    [put],
  );

  return {
    items,
    tags,
    ready,
    syncMessage: writeErr ?? listenErr,
    saveItem,
    removeItem,
    setAvailable,
    addTag,
    removeTag,
  };
}
