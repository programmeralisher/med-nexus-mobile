import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { balanceOf, fmtDate, fmtMoney, type Customer, type Store } from "@/lib/store";
import { downloadLedgerPdf, type Period } from "@/lib/pdf";
import { StepUpPasswordDialog } from "@/components/StepUpPasswordDialog";
import { ArrowLeft, Download, Plus, Trash2 } from "lucide-react";

export function LedgerScreen({
  store,
  customerId,
  onBack,
}: {
  store: Store;
  customerId: string;
  onBack: () => void;
}) {
  const customer = store.data.customers.find((c) => c.id === customerId);
  const [payOpen, setPayOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState("");
  const [payNote, setPayNote] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [period, setPeriod] = React.useState<Period>("monthly");

  // Local, uncommitted edits for the inline description/amount inputs below.
  // Keyed by entry id. While a draft exists for a field, the input shows the
  // draft value instead of store.data's value -- this is what lets the user
  // keep typing undisturbed even if a real-time update for a DIFFERENT field
  // (or from another device) arrives mid-edit. The draft is committed to
  // Firestore (via store.editEntry) on blur or Enter, then cleared, so the
  // input reverts to reading directly from store.data again -- which by then
  // already reflects the just-committed value optimistically.
  const [descDrafts, setDescDrafts] = React.useState<Record<string, string>>({});
  const [amountDrafts, setAmountDrafts] = React.useState<Record<string, string>>({});

  // NEW in Phase 4: delete-transaction now requires the step-up password,
  // per the brief's §6a consistency requirement (edit-customer-info,
  // delete-customer, and delete-transaction should all use the same
  // pattern). This previously called store.removeEntry() directly with no
  // confirmation at all -- confirmed by reading this file before touching
  // it. One shared dialog instance, reused for whichever entry id is
  // currently pending, rather than one dialog per row.
  const [deleteEntryId, setDeleteEntryId] = React.useState<string | null>(null);

  if (!customer) return null;
  const c: Customer = customer;
  const entries = [...c.entries].sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const total = balanceOf(c);

  const addItem = () => {
    const amt = Number(amount);
    if (!desc.trim() || !amt) return;
    store.addEntry(c.id, {
      type: "item",
      description: desc.trim(),
      amount: amt,
      date: new Date().toISOString(),
    });
    setDesc("");
    setAmount("");
  };

  const recordPayment = () => {
    const amt = Number(payAmount);
    if (!amt) return;
    store.addEntry(c.id, {
      type: "payment",
      description: payNote.trim() || "Payment received",
      amount: amt,
      date: new Date().toISOString(),
    });
    setPayAmount("");
    setPayNote("");
    setPayOpen(false);
  };

  // Committed on blur / Enter, not on every keystroke -- see the comment on
  // descDrafts/amountDrafts above for why. Skips the Firestore write
  // entirely if the value didn't actually change (e.g. the user just
  // clicked into the field and back out), rather than firing a no-op update
  // on every blur.
  const commitDescription = (entryId: string, value: string) => {
    setDescDrafts((d) => {
      const next = { ...d };
      delete next[entryId];
      return next;
    });
    const original = c.entries.find((x) => x.id === entryId)?.description;
    if (value !== original) store.editEntry(c.id, entryId, { description: value });
  };

  const commitAmount = (entryId: string, value: string) => {
    setAmountDrafts((d) => {
      const next = { ...d };
      delete next[entryId];
      return next;
    });
    const original = c.entries.find((x) => x.id === entryId)?.amount;
    const next = Number(value) || 0;
    if (next !== original) store.editEntry(c.id, entryId, { amount: next });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-foreground">{c.name}</h2>
            <p className="truncate text-xs text-muted-foreground">{c.contact || "No contact"}</p>
          </div>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-auto">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="h-9 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => downloadLedgerPdf(c, period)}>
            <Download className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex">
        <Input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Item description e.g. Brufen syp"
          className="min-w-0"
        />
        <Input
          value={amount}
          inputMode="numeric"
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-28 sm:w-36"
        />
        <Button onClick={addItem} className="col-span-2 sm:col-auto">
          <Plus className="h-4 w-4" /> Add item
        </Button>
      </div>

      <div className="mt-4 flex-1 overflow-auto rounded-2xl border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 bg-secondary text-secondary-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">S.No</th>
              <th className="px-3 py-2 text-left font-semibold">Item description</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
              <th className="px-3 py-2 text-left font-semibold">Date</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                  No entries yet.
                </td>
              </tr>
            )}
            {entries.map((e, i) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-1.5">
                  <input
                    className="w-full rounded bg-transparent px-1 py-1 outline-none focus:bg-accent"
                    value={descDrafts[e.id] ?? e.description}
                    onChange={(ev) => setDescDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                    onBlur={(ev) => commitDescription(e.id, ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") ev.currentTarget.blur();
                    }}
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    className={
                      "w-24 rounded bg-transparent px-1 py-1 text-right outline-none focus:bg-accent " +
                      (e.type === "payment" ? "text-success" : "")
                    }
                    value={amountDrafts[e.id] ?? String(e.amount)}
                    inputMode="numeric"
                    onChange={(ev) => setAmountDrafts((d) => ({ ...d, [e.id]: ev.target.value }))}
                    onBlur={(ev) => commitAmount(e.id, ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") ev.currentTarget.blur();
                    }}
                  />
                  {e.type === "payment" && <span className="ml-1 text-xs text-success">paid</span>}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                  {fmtDate(e.date)}
                </td>
                <td className="px-2">
                  <button
                    onClick={() => setDeleteEntryId(e.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Erase entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-lg">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Total amount</p>
          <p className="truncate text-2xl font-black text-foreground">{fmtMoney(total)}</p>
        </div>
        <Button variant="success" className="h-11 shrink-0" onClick={() => setPayOpen(true)}>
          Record payment
        </Button>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment · {c.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              inputMode="numeric"
              placeholder="Amount received"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
            <Input
              placeholder="Note (optional)"
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Current total {fmtMoney(total)} → {fmtMoney(total - (Number(payAmount) || 0))}
            </p>
          </div>
          <DialogFooter>
            <Button variant="success" className="w-full" onClick={recordPayment}>
              Save payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StepUpPasswordDialog
        open={deleteEntryId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteEntryId(null);
        }}
        title="Delete this entry?"
        description="This can't be undone. Re-enter the shop password to confirm."
        confirmLabel="Delete entry"
        destructive
        onConfirm={() => {
          if (deleteEntryId) store.removeEntry(c.id, deleteEntryId);
        }}
      />
    </div>
  );
}
