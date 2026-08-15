/**
 * Finalized Firestore data model for the shop credit-ledger migration.
 * This file defines the WIRE FORMAT ONLY — it is not imported by store.ts or
 * any component yet (that wiring is Phase 2: "Rewrite useAppStore
 * internals"). Phase 1's job is to nail down this shape so Phase 2 has a
 * fixed target to build against instead of improvising it mid-rewrite.
 *
 * Read alongside firestore.rules at the repo root, which enforces access
 * to exactly this tree.
 */
import type { Timestamp } from "firebase/firestore";
import type { EntryType } from "./store";

/**
 * Single fixed shop ID. This is one store, not multi-tenant SaaS — every
 * device/UID that's ever authorized always points at this same tree. There
 * is deliberately no "which shop" routing logic anywhere in this app.
 */
export const SHOP_ID = "zeeshan-medical-store";

// ---------------------------------------------------------------------------
// Path builders — every place in the app that needs a Firestore path should
// go through these instead of hand-typing path strings, so there is exactly
// one source of truth for the tree shape.
// ---------------------------------------------------------------------------

export const shopDocPath = () => `shops/${SHOP_ID}` as const;

export const customersCollectionPath = () => `shops/${SHOP_ID}/customers` as const;
export const customerDocPath = (customerId: string) =>
  `shops/${SHOP_ID}/customers/${customerId}` as const;

export const entriesCollectionPath = (customerId: string) =>
  `shops/${SHOP_ID}/customers/${customerId}/entries` as const;
export const entryDocPath = (customerId: string, entryId: string) =>
  `shops/${SHOP_ID}/customers/${customerId}/entries/${entryId}` as const;

export const historyCollectionPath = () => `shops/${SHOP_ID}/history` as const;
export const historyDocPath = (historyId: string) =>
  `shops/${SHOP_ID}/history/${historyId}` as const;

// NOTE on this path: the brief's §4 sketch shows `shops/{shopId}/settings`
// as "a single doc," but that path has 3 segments (collection/doc/collection),
// which Firestore requires to be a COLLECTION reference, not a document —
// document paths must have an even segment count. To get one fixed settings
// document, it needs a 4-segment path with an explicit doc id. Using a fixed
// id ("main") under a "settings" subcollection, since there is and will only
// ever be exactly one settings doc for this one shop.
export const settingsDocPath = () => `shops/${SHOP_ID}/settings/main` as const;

// Used only by scripts/phase1-smoke-test.mjs — a throwaway diagnostics
// collection, never touched by the real app, so smoke tests can never
// collide with or corrupt real data.
export const diagnosticsDocPath = (testId: string) =>
  `shops/${SHOP_ID}/_diagnostics/${testId}` as const;

// ---------------------------------------------------------------------------
// Document shapes
// ---------------------------------------------------------------------------

export interface ShopDoc {
  name: string;
  createdAt: Timestamp;
}

export interface CustomerDoc {
  name: string;
  contact: string;
  paidMonths: string[]; // e.g. "2026-08" — same format as today's Customer.paidMonths
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /**
   * Soft delete, never a real Firestore document delete. Closes audit Risk
   * #2 (hard deletes racing with a concurrent edit on another offline
   * device). All reads/listeners filter `deleted == false`. Enforced at the
   * rules level too: see firestore.rules, `allow delete: if false` on this
   * collection.
   */
  deleted: boolean;
  deletedAt: Timestamp | null;
}

export interface EntryDoc {
  type: EntryType; // imported from store.ts so the two can't silently drift apart
  description: string;
  /**
   * *** DECISION THAT NEEDS YOUR SIGN-OFF BEFORE PHASE 2 USES IT ***
   *
   * Stored as an INTEGER number of paisa (rupees × 100, rounded), not a
   * float rupee amount. store.ts today uses `amount: number` in rupees, and
   * LedgerScreen's amount inputs are plain text fields with no decimal
   * restriction (`inputMode="numeric"` is just a mobile-keyboard hint, not
   * validation) — so a fractional-rupee entry (e.g. "45.50") is already
   * possible today. Summing many such float rupee values can drift by a
   * fraction of a paisa (classic IEEE-754 behavior — 0.1 + 0.2 !== 0.3);
   * `fmtMoney`'s `Math.round()` hides that in the display today, but it's
   * exactly the kind of thing that could eventually cause the two-devices'
   * balances to diverge by a paisa in a rare rounding edge case once sync is
   * involved. Storing whole-number paisa in Firestore removes the
   * possibility entirely — integer addition never drifts, regardless of how
   * many entries or how they're split across devices.
   *
   * This does NOT change store.ts's math in Phase 1 — this file just defines
   * the wire format. Phase 2 would convert at the boundary: UI keeps working
   * in rupees exactly as today (Entry.amount stays a rupee number, fmtMoney
   * stays identical), and store.ts's Firestore read/write layer multiplies
   * by 100 going in and divides by 100 coming out. See rupeesToPaisa /
   * paisaToRupees below — written now, not wired in until Phase 2.
   *
   * If you'd rather keep it simple and store rupee floats as-is (accepting
   * the theoretical drift risk), say so before Phase 2 and I'll drop this.
   */
  amountPaisa: number;
  date: string; // ISO string — same format as today's Entry.date
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /**
   * Diagnostic only — which device/install wrote this, for debugging a sync
   * conflict later. Never shown in the UI, never used in any balance or
   * display calculation.
   */
  deviceId: string;
  deleted: boolean;
  deletedAt: Timestamp | null;
}

export interface HistoryDoc {
  at: Timestamp;
  text: string;
}

export interface SettingsDoc {
  /**
   * OPEN QUESTION for Phase 2, noted here rather than decided: should theme
   * actually sync across devices, or stay device-local? A synced theme means
   * one phone's dark-mode toggle flips another phone's screen the next time
   * it's online, which may be surprising. The audit flagged this as worth a
   * deliberate choice rather than an accidental default. The type is defined
   * here for completeness; Phase 2 decides whether store.ts actually reads/
   * writes this field or keeps theme in local-only state.
   */
  theme: "light" | "dark";
  whatsapp: string;
}

// ---------------------------------------------------------------------------
// Money conversion helpers — pure functions, not wired into store.ts yet.
// Phase 2 will use these at the Firestore read/write boundary if the
// integer-paisa decision above is approved.
// ---------------------------------------------------------------------------

/** Rupees (possibly fractional) -> integer paisa, for writing to Firestore. */
export const rupeesToPaisa = (rupees: number): number => Math.round(rupees * 100);

/** Integer paisa (from Firestore) -> rupees, for the existing UI/math to consume. */
export const paisaToRupees = (paisa: number): number => paisa / 100;
