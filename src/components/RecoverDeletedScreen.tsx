import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepUpPasswordDialog } from "@/components/StepUpPasswordDialog";
import {
  balanceOf,
  fetchDeletedCustomers,
  fmtDateTime,
  fmtMoney,
  paidTotalOf,
  type DeletedCustomer,
  type Store,
} from "@/lib/store";
import { ArchiveRestore, ArrowLeft, Search, User } from "lucide-react";

/**
 * Settings -> Recover Deleted Credits. Flow: search deleted customers ->
 * select one to see an identifying summary -> Restore (step-up password).
 *
 * Deliberately a one-time fetch (fetchDeletedCustomers in store.ts), not a
 * live listener -- this is a rare admin lookup, not something the rest of
 * the app needs in real time, and keeping it a plain useState + refetch
 * avoids adding anything to subscribeAppData's always-on listener set.
 * Restoring itself (store.restoreCustomer) is a single Firestore field flip
 * on the customer's existing doc/id; the already-running customers listener
 * elsewhere in the app brings the customer and their complete, untouched
 * ledger back on its own -- see the comments above fsRestoreCustomer in
 * store.ts. This screen only has to (a) show the list safely and (b) call
 * that one mutator behind the same step-up password every other sensitive
 * action already uses.
 */
export function RecoverDeletedScreen({ store, onBack }: { store: Store; onBack: () => void }) {
  const [loading, setLoading] = React.useState(true);
  const [deleted, setDeleted] = React.useState<DeletedCustomer[]>([]);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [restoredName, setRestoredName] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    void fetchDeletedCustomers().then((list) => {
      setDeleted(list);
      setLoading(false);
    });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const selected = deleted.find((c) => c.id === selectedId) ?? null;

  const filtered = deleted.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()));

  const handleRestore = () => {
    if (!selected) return;
    store.restoreCustomer(selected.id, selected.name);
    // Local-only removal from this screen's own list -- the main app's
    // customer list picks the restored record up on its own via the
    // already-running Firestore listener (see store.ts); this just makes
    // the deleted-list stop showing a customer that is no longer deleted.
    setDeleted((d) => d.filter((c) => c.id !== selected.id));
    setRestoredName(selected.name);
    setSelectedId(null);
  };

  if (selected) {
    const recovered = paidTotalOf(selected);
    const outstanding = balanceOf(selected);
    const credit = outstanding + recovered;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-foreground">Restore customer</h2>
            <p className="truncate text-xs text-muted-foreground">
              Deleted {fmtDateTime(selected.deletedAt)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Name</p>
            <p className="text-sm font-semibold text-foreground">{selected.name}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Contact</p>
            <p className="text-sm text-foreground">{selected.contact || "No contact on file"}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Entries</p>
              <p className="text-sm font-semibold text-foreground">{selected.entries.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Outstanding</p>
              <p className="text-sm font-semibold text-foreground">{fmtMoney(outstanding)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total credit</p>
              <p className="text-sm text-foreground">{fmtMoney(credit)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total recovery</p>
              <p className="text-sm text-foreground">{fmtMoney(recovered)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Restoring brings back this exact customer record and their complete existing ledger --
            nothing is recreated or duplicated.
          </p>
          <Button className="h-11 w-full" onClick={() => setConfirmOpen(true)}>
            <ArchiveRestore className="h-4 w-4" /> Restore this customer
          </Button>
        </div>

        <StepUpPasswordDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Restore ${selected.name}?`}
          description="Re-enter the shop password to restore this customer and their ledger."
          confirmLabel="Restore customer"
          onConfirm={handleRestore}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-black text-foreground">Recover deleted credits</h2>
      </div>

      {restoredName && (
        <p className="mt-3 rounded-xl border border-border bg-secondary/50 p-3 text-sm text-foreground">
          {restoredName} was restored. It will reappear in Credits shortly.
        </p>
      )}

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="pl-9"
        />
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-auto">
        {loading && <p className="py-10 text-center text-sm text-muted-foreground">Loading...</p>}
        {!loading &&
          filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary">
                <User className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{c.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.contact || "No contact"} · deleted {fmtDateTime(c.deletedAt)}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {fmtMoney(balanceOf(c))}
              </span>
            </button>
          ))}
        {!loading && filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {deleted.length === 0 ? "No deleted customers." : "No matches."}
          </p>
        )}
      </div>
    </div>
  );
}
