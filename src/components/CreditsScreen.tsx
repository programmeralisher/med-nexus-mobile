import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  balanceOf,
  findCustomerByName,
  fmtDateTime,
  fmtMoney,
  type Customer,
  type Store,
} from "@/lib/store";
import { Plus, Search, UserRound } from "lucide-react";

export function CreditsScreen({ store, onOpen }: { store: Store; onOpen: (c: Customer) => void }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [dupWarning, setDupWarning] = React.useState<Customer | null>(null);

  const list = store.data.customers.filter((c) =>
    c.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = findCustomerByName(store.data.customers, trimmed);
    if (existing) {
      setDupWarning(existing);
      return;
    }
    store.addCustomer(trimmed, contact.trim());
    setName("");
    setContact("");
    setDupWarning(null);
    setOpen(false);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="relative min-w-0">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, e.g. Nisar Ahmed"
            className="h-11 pl-9"
          />
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) setDupWarning(null);
          }}
        >
          <DialogTrigger asChild>
            <Button className="h-11 shrink-0">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add new credit</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New credit holder</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="Full name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setDupWarning(null);
                }}
              />
              <Input
                placeholder="Contact number e.g. 03233745904"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
              {dupWarning && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <p>
                    A customer named "{dupWarning.name}" already exists (outstanding{" "}
                    {fmtMoney(balanceOf(dupWarning))}).
                  </p>
                  <button
                    type="button"
                    className="mt-1 font-medium underline"
                    onClick={() => {
                      const existing = dupWarning;
                      setOpen(false);
                      setDupWarning(null);
                      setName("");
                      setContact("");
                      onOpen(existing);
                    }}
                  >
                    Open their ledger instead
                  </button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="success" className="w-full" onClick={create}>
                Make new ledger
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No credit holders yet. Tap “Add new credit” to make a ledger.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpen(c)}
              className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.contact || "No contact"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="text-lg font-black text-destructive">{fmtMoney(balanceOf(c))}</p>
                </div>
                <p className="text-right text-[11px] text-muted-foreground">
                  Updated
                  <br />
                  {fmtDateTime(c.updatedAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
