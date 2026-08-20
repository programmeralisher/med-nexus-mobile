import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { getDeviceId } from "./auth";
import { customerDocPath, entryDocPath, historyDocPath, rupeesToPaisa } from "./firestore-schema";
import { fmtMoney, uid } from "./store";

// ---------------------------------------------------------------------------
// Bulk Entry / Bulk Sheet. A spreadsheet-style way to add many normal
// credit/item entries at once, instead of opening one customer's ledger at
// a time. Scope, per the refined requirements: item/credit entries only (no
// type column -- the table is Customer / Description / Price, matching the
// stated primary use case of entering many purchases quickly), dated
// "now" for every row (no date column), and an all-or-nothing validation
// gate -- if anything in the sheet is invalid, nothing commits, full stop.
//
// Every entry this produces is byte-for-byte the same EntryDoc shape a
// normal single ledger entry produces (type "item", integer paisa, stable
// client-generated id, soft-delete fields) -- the only difference bulk-sheet
// entries carry is their history line saying "through bulk sheet", not
// anything in the entry document itself.
// ---------------------------------------------------------------------------

/** One row's resolved customer -- either an existing customer (picked from
 * the combobox) or a brand-new one (typed a name with no existing match).
 * Deliberately not a bare customerId string: the UI needs the name either
 * way (existing, to display; new, to create), and keeping them as one
 * discriminated value makes "which case is this" impossible to mix up. */
export type RowCustomer =
  { kind: "existing"; id: string; name: string } | { kind: "new"; name: string };

export interface SheetRow {
  key: string; // stable React key for this row, local UI only -- never sent to Firestore
  customer: RowCustomer | null;
  description: string;
  price: string; // kept as the raw typed string; parsed to a number at validation time
}

export interface ValidRow {
  key: string;
  customer: RowCustomer;
  description: string;
  amount: number;
}

/** A row counts as "empty" (silently ignored, not an error) only when
 * NONE of its fields have been touched -- this is what lets a sheet have
 * a few unused trailing rows without blocking import. Any row with SOME
 * but not all fields filled in is a real validation error, not skipped. */
export function isRowEmpty(row: SheetRow): boolean {
  return !row.customer && !row.description.trim() && !row.price.trim();
}

export function validateSheetRows(rows: SheetRow[]): {
  valid: ValidRow[];
  errors: Map<string, string>;
} {
  const errors = new Map<string, string>();
  const valid: ValidRow[] = [];

  for (const row of rows) {
    if (isRowEmpty(row)) continue;

    if (!row.customer) {
      errors.set(row.key, "Select a customer");
      continue;
    }
    const description = row.description.trim();
    if (!description) {
      errors.set(row.key, "Description required");
      continue;
    }
    const amount = Number(row.price);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.set(row.key, "Enter a valid amount");
      continue;
    }

    valid.push({ key: row.key, customer: row.customer, description, amount });
  }

  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Commit. Same idempotent-chunking design as before: every document ID
// (new customers and every entry alike) is generated upfront with the
// app's own uid() -- before any network call -- so if one chunk's commit()
// throws, the chunks before it have already committed with their own fixed
// IDs and are never touched again; this function stops immediately rather
// than continuing past a failure, so nothing is ever applied twice.
// ---------------------------------------------------------------------------

export interface BulkImportProgress {
  totalChunks: number;
  completedChunks: number;
}

export interface BulkImportResult {
  entriesCreated: number;
  customersCreated: number;
  customersTouched: number;
}

const MAX_OPS_PER_CHUNK = 400;

export async function commitBulkSheet(
  rows: ValidRow[],
  onProgress?: (p: BulkImportProgress) => void,
): Promise<BulkImportResult> {
  const services = getFirebase();
  if (!services) throw new Error("Firebase is not available in this environment.");
  const { db } = services;
  const deviceId = getDeviceId();

  // Resolve every row to a real customer id. "existing" rows already carry
  // one (picked from the live customer list in the combobox, so it's
  // already guaranteed to be a real, current customer -- no re-matching by
  // name needed here). "new" rows get exactly one id generated per unique
  // name across the whole sheet, so if the same new name was typed on two
  // different rows before either got created, they still end up attached
  // to the SAME new customer rather than creating two.
  const newIdByName = new Map<string, string>();
  const newCustomers: { id: string; name: string }[] = [];
  const resolvedCustomerId = new Map<string, string>();

  for (const row of rows) {
    if (row.customer.kind === "existing") {
      resolvedCustomerId.set(row.key, row.customer.id);
      continue;
    }
    const key = row.customer.name.trim().toLowerCase();
    let id = newIdByName.get(key);
    if (!id) {
      id = uid();
      newIdByName.set(key, id);
      newCustomers.push({ id, name: row.customer.name.trim() });
    }
    resolvedCustomerId.set(row.key, id);
  }

  interface Op {
    path: string;
    data: Record<string, unknown>;
    merge?: boolean;
  }
  const ops: Op[] = [];

  // New customers created via the sheet get no contact info -- there's no
  // contact column in this table by design (matches the requested S.No /
  // Customer / Description / Price shape). Addable later via Manage Credit
  // Owners, same as any customer's contact can be edited any time.
  for (const nc of newCustomers) {
    ops.push({
      path: customerDocPath(nc.id),
      data: {
        name: nc.name,
        contact: "",
        paidMonths: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deleted: false,
        deletedAt: null,
      },
    });
  }

  const touchedIds = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    const customerId = resolvedCustomerId.get(row.key);
    if (!customerId) continue; // unreachable given the resolution pass above

    const entryId = uid();
    ops.push({
      path: entryDocPath(customerId, entryId),
      data: {
        type: "item",
        description: row.description,
        amountPaisa: rupeesToPaisa(row.amount),
        date: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deviceId,
        deleted: false,
        deletedAt: null,
      },
    });

    // Exact wording requested: "<description> added in <name>'s ledger
    // through bulk sheet" -- with the amount folded in, so bulk-sheet
    // history lines stay consistent with every other history line in the
    // app (which all include the amount) rather than being the one kind
    // of entry missing it.
    const historyId = uid();
    const historyText = `${row.description} (${fmtMoney(row.amount)}) added in ${row.customer.name}'s ledger through bulk sheet`;
    ops.push({
      path: historyDocPath(historyId),
      data: { text: historyText, at: serverTimestamp() },
    });

    touchedIds.add(customerId);
  }

  for (const id of touchedIds) {
    ops.push({ path: customerDocPath(id), data: { updatedAt: serverTimestamp() }, merge: true });
  }

  const chunks: Op[][] = [];
  for (let i = 0; i < ops.length; i += MAX_OPS_PER_CHUNK) {
    chunks.push(ops.slice(i, i + MAX_OPS_PER_CHUNK));
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, op.path);
      if (op.merge) batch.set(ref, op.data, { merge: true });
      else batch.set(ref, op.data);
    }
    await batch.commit();
    onProgress?.({ totalChunks: chunks.length, completedChunks: i + 1 });
  }

  return {
    entriesCreated: rows.length,
    customersCreated: newCustomers.length,
    customersTouched: touchedIds.size,
  };
}
