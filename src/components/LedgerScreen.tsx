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
                    value={e.description}
                    onChange={(ev) =>
                      store.editEntry(c.id, e.id, { description: ev.target.value })
                    }
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    className={
                      "w-24 rounded bg-transparent px-1 py-1 text-right outline-none focus:bg-accent " +
                      (e.type === "payment" ? "text-success" : "")
                    }
                    value={e.amount}
                    inputMode="numeric"
                    onChange={(ev) =>
                      store.editEntry(c.id, e.id, { amount: Number(ev.target.value) || 0 })
                    }
                  />
                  {e.type === "payment" && (
                    <span className="ml-1 text-xs text-success">paid</span>
                  )}
                </td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                  {fmtDate(e.date)}
                </td>
                <td className="px-2">
                  <button
                    onClick={() => store.removeEntry(c.id, e.id)}
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
    </div>
  );
}
