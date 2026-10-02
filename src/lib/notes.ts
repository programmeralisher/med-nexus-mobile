import * as React from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { getFirebase } from "./firebase";
import { ensureSignedIn } from "./auth";
import { SHOP_ID, paisaToRupees, rupeesToPaisa } from "./firestore-schema";

/**
 * Personal "Additional Notes" -- a standalone mini-ledger (note + amount).
 *
 * Deliberately kept OUT of useAppStore / AppData: nothing here is a customer
 * or an entry, so balanceOf, paidTotalOf, the dashboard Credit/Recovery
 * cards, charts, reports and PDFs can never include these amounts.
 *
 * Storage: docs in the existing `settings` collection with ids "note_<id>"
 * (the existing rules already allow read/write there, so NO rules redeploy
 * is needed). The settings listener in store.ts reads only settings/main,
 * so it never sees these. Firestore's persistent cache gives offline
 * read/write and automatic sync, like the rest of the app.
 */
export interface Note {
  id: string;
  text: string;
  amount: number;
  date: string; // ISO
}

const PREFIX = "note_";
const settingsCol = `shops/${SHOP_ID}/settings`;

export function useNotes() {
  const [notes, setNotes] = React.useState<Note[]>([]);
  const [ready, setReady] = React.useState(false);

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
        console.error("[notes] sign-in failed", err);
        setReady(true);
        return;
      }
      if (cancelled) return;
      unsub = onSnapshot(
        collection(services.db, settingsCol),
        (snap) => {
          if (cancelled) return;
          const next: Note[] = [];
          for (const d of snap.docs) {
            if (!d.id.startsWith(PREFIX)) continue;
            const v = d.data() as {
              text?: string;
              amountPaisa?: number;
              date?: string;
              deleted?: boolean;
            };
            if (v.deleted) continue;
            next.push({
              id: d.id,
              text: v.text ?? "",
              amount: paisaToRupees(v.amountPaisa ?? 0),
              date: v.date ?? new Date().toISOString(),
            });
          }
          next.sort((a, b) => +new Date(b.date) - +new Date(a.date));
          setNotes(next);
          setReady(true);
        },
        (err) => {
          console.error("[notes] listener error", err);
          setReady(true);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const addNote = React.useCallback((text: string, amount: number) => {
    const id = PREFIX + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const date = new Date().toISOString();
    setNotes((n) => [{ id, text, amount, date }, ...n]);
    const services = getFirebase();
    if (!services) return;
    setDoc(doc(services.db, `${settingsCol}/${id}`), {
      text,
      amountPaisa: rupeesToPaisa(amount),
      date,
      deleted: false,
      createdAt: serverTimestamp(),
    }).catch((err) => console.error("[notes] add failed", err));
  }, []);

  const removeNote = React.useCallback((id: string) => {
    setNotes((n) => n.filter((x) => x.id !== id));
    const services = getFirebase();
    if (!services) return;
    updateDoc(doc(services.db, `${settingsCol}/${id}`), { deleted: true }).catch((err) =>
      console.error("[notes] delete failed", err),
    );
  }, []);

  return { notes, ready, addNote, removeNote };
}
