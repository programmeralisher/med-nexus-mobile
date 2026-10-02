import * as React from "react";
import { collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { ensureSignedIn } from "./auth";
import { SHOP_ID, paisaToRupees, rupeesToPaisa } from "./firestore-schema";

/**
 * Personal "Stock" list -- items the shop owner tracks for his own reference.
 *
 * Like Additional Notes, this is kept completely OUT of useAppStore/AppData:
 * it has no connection to customers, credit, recovery, reports or backups.
 *
 * Storage: docs in the existing `settings` collection (rules already allow
 * it, so no rules redeploy): "stock_<id>" for items, "stocktag_<slug>" for
 * custom tags. The built-in tags (Tablet, Syrup) are virtual -- always there,
 * no document. Firestore's persistent cache gives offline use + auto sync.
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

const ITEM_PREFIX = "stock_";
const TAG_PREFIX = "stocktag_";
const settingsCol = `shops/${SHOP_ID}/settings`;

/** "Cefim 200mg" and "cefim  200 mg" are the same item. */
export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** Per-tablet price, or null when it can't be worked out. */
export function perTablet(item: StockItem): number | null {
  if (item.price == null || !item.tabletsPerPacket || item.tabletsPerPacket <= 0) return null;
  return Math.round((item.price * 100) / item.tabletsPerPacket) / 100;
}

export function useStock() {
  const [items, setItems] = React.useState<StockItem[]>([]);
  const [customTags, setCustomTags] = React.useState<StockTag[]>([]);
  const [ready, setReady] = React.useState(false);
  const itemsRef = React.useRef<StockItem[]>([]);
  const tagsRef = React.useRef<StockTag[]>(BUILTIN_TAGS);

  React.useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | null = null;
    (async () => {
      const services = getFirebase();
      if (!services) {
        setReady(true);
        return;
      }
      try {
        await ensureSignedIn();
      } catch (err) {
        console.error("[stock] sign-in failed", err);
        setReady(true);
        return;
      }
      if (cancelled) return;
      unsub = onSnapshot(
        collection(services.db, settingsCol),
        (snap) => {
          if (cancelled) return;
          const nextItems: StockItem[] = [];
          const nextTags: StockTag[] = [];
          for (const d of snap.docs) {
            const v = d.data() as {
              deleted?: boolean;
              tagId?: string;
              name?: string;
              tabletsPerPacket?: number | null;
              pricePaisa?: number | null;
              quantity?: number | null;
              notes?: string;
              available?: boolean;
              updatedAt?: string;
              packet?: boolean;
            };
            if (v.deleted) continue;
            if (d.id.startsWith(ITEM_PREFIX)) {
              nextItems.push({
                id: d.id,
                tagId: String(v.tagId ?? "tablet"),
                name: String(v.name ?? ""),
                tabletsPerPacket:
                  typeof v.tabletsPerPacket === "number" ? v.tabletsPerPacket : null,
                price: typeof v.pricePaisa === "number" ? paisaToRupees(v.pricePaisa) : null,
                quantity: typeof v.quantity === "number" ? v.quantity : null,
                notes: String(v.notes ?? ""),
                available: v.available !== false,
                updatedAt: String(v.updatedAt ?? ""),
              });
            } else if (d.id.startsWith(TAG_PREFIX)) {
              nextTags.push({
                id: d.id,
                name: String(v.name ?? ""),
                packet: v.packet === true,
                builtin: false,
              });
            }
          }
          nextItems.sort((a, b) => a.name.localeCompare(b.name));
          nextTags.sort((a, b) => a.name.localeCompare(b.name));
          itemsRef.current = nextItems;
          tagsRef.current = [...BUILTIN_TAGS, ...nextTags];
          setItems(nextItems);
          setCustomTags(nextTags);
          setReady(true);
        },
        (err) => {
          console.error("[stock] listener error", err);
          setReady(true);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const tags = React.useMemo(() => [...BUILTIN_TAGS, ...customTags], [customTags]);

  /** Returns an error message, or null when saved. `id` = editing that item. */
  const saveItem = React.useCallback((input: StockInput, id?: string): string | null => {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name) return "Item name is required";
    const key = normName(name);
    if (
      itemsRef.current.some(
        (i) => i.id !== id && i.tagId === input.tagId && normName(i.name) === key,
      )
    ) {
      return `"${name}" is already in the list`;
    }
    const services = getFirebase();
    if (!services) return "Not connected";
    const docId =
      id ?? ITEM_PREFIX + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    setDoc(
      doc(services.db, `${settingsCol}/${docId}`),
      {
        tagId: input.tagId,
        name,
        tabletsPerPacket: input.tabletsPerPacket,
        pricePaisa: input.price == null ? null : rupeesToPaisa(input.price),
        quantity: input.quantity,
        notes: input.notes.trim(),
        available: input.available,
        updatedAt: new Date().toISOString(),
        deleted: false,
      },
      { merge: true },
    ).catch((err) => console.error("[stock] save failed", err));
    return null;
  }, []);

  const removeItem = React.useCallback((id: string) => {
    const services = getFirebase();
    if (!services) return;
    updateDoc(doc(services.db, `${settingsCol}/${id}`), { deleted: true }).catch((err) =>
      console.error("[stock] delete failed", err),
    );
  }, []);

  const setAvailable = React.useCallback((id: string, available: boolean) => {
    const services = getFirebase();
    if (!services) return;
    updateDoc(doc(services.db, `${settingsCol}/${id}`), {
      available,
      updatedAt: new Date().toISOString(),
    }).catch((err) => console.error("[stock] availability failed", err));
  }, []);

  /** Returns an error message, or the new tag's id. */
  const addTag = React.useCallback(
    (rawName: string, packet: boolean): { error?: string; id?: string } => {
      const name = rawName.trim().replace(/\s+/g, " ");
      if (!name) return { error: "Tag name is required" };
      if (tagsRef.current.some((t) => normName(t.name) === normName(name))) {
        return { error: `Tag "${name}" already exists` };
      }
      const services = getFirebase();
      if (!services) return { error: "Not connected" };
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const id = TAG_PREFIX + (slug || Math.random().toString(36).slice(2, 8));
      setDoc(
        doc(services.db, `${settingsCol}/${id}`),
        { name, packet, deleted: false },
        { merge: true },
      ).catch((err) => console.error("[stock] add tag failed", err));
      return { id };
    },
    [],
  );

  /** A tag can only go when no item uses it. */
  const removeTag = React.useCallback((id: string): string | null => {
    if (itemsRef.current.some((i) => i.tagId === id)) {
      return "Delete or move the items under this tag first";
    }
    const services = getFirebase();
    if (!services) return "Not connected";
    updateDoc(doc(services.db, `${settingsCol}/${id}`), { deleted: true }).catch((err) =>
      console.error("[stock] delete tag failed", err),
    );
    return null;
  }, []);

  return { items, tags, ready, saveItem, removeItem, setAvailable, addTag, removeTag };
}
