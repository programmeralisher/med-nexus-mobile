import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StepUpPasswordDialog } from "@/components/StepUpPasswordDialog";
import { balanceOf, findCustomerByName, fmtMoney, type Customer, type Store } from "@/lib/store";
import { ArrowLeft, Search, User } from "lucide-react";

/**
 * §6a "Manage Credit Owners" -- the one deliberate new feature alongside the
 * sync migration. Flow: Settings -> Manage Credit Owners -> Search Customer
 * -> Select Customer -> Edit Customer Information.
 *
 * Editable fields: name and phone number only. The brief also lists CNIC
 * "if the app tracks one, add the field only if it doesn't already exist
 * and the user confirms they want it" -- the Customer type has no cnic
 * field today (confirmed by reading store.ts before writing this), and
 * that confirmation hasn't been given, so it's intentionally not added
 * here. Flagged for you to decide, not assumed either way.
 *
 * Editing here is metadata-only: it calls store.updateCustomerInfo(), which
 * writes only the customer doc's name/contact fields and never touches the
 * entries subcollection -- balanceOf() and all financial history are
 * completely unaffected, which is why the balance is shown read-only below
 * as a reassurance, not an editable field.
 *
 * Saving requires the step-up password every time (StepUpPasswordDialog),
 * matching delete-customer and delete-transaction, per the brief. Works
 * fully offline and syncs like everything else, since it's built on the
 * same store.ts data layer -- no special-casing needed here for that.
 */
export function ManageCreditOwnersScreen({ store, onBack }: { store: Store; onBack: () => void }) {
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [dupError, setDupError] = React.useState<string | null>(null);

  const selected = store.data.customers.find((c) => c.id === selectedId) ?? null;

  const filtered = store.data.customers.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const openEdit = (c: Customer) => {
    setSelectedId(c.id);
    setName(c.name);
    setContact(c.contact);
    setDupError(null);
  };

  const handleSaveClick = () => {
    if (!selected) return;
    const trimmed = name.trim();
    if (trimmed && trimmed.toLowerCase() !== selected.name.toLowerCase()) {
      const existing = findCustomerByName(store.data.customers, trimmed, selected.id);
      if (existing) {
        setDupError(`A customer named "${trimmed}" already exists.`);
        return;
      }
    }
    setDupError(null);
    setConfirmOpen(true);
  };

  const saveChanges = () => {
    if (!selected) return;
    const patch: { name?: string; contact?: string } = {};
    if (name.trim() && name.trim() !== selected.name) patch.name = name.trim();
    if (contact.trim() !== selected.contact) patch.contact = contact.trim();
    if (Object.keys(patch).length === 0) {
      setSelectedId(null);
      return;
    }
    store.updateCustomerInfo(selected.id, patch);
    store.log(`Updated contact info for ${selected.name}`);
    setSelectedId(null);
  };

  if (selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black text-foreground">Edit customer info</h2>
            <p className="truncate text-xs text-muted-foreground">
              Outstanding balance {fmtMoney(balanceOf(selected))} -- unaffected by this edit
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDupError(null);
              }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Phone number
            </label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          {dupError && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {dupError}
            </p>
          )}
          <Button className="h-11 w-full" onClick={handleSaveClick}>
            Save changes
          </Button>
        </div>

        <StepUpPasswordDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Confirm changes to ${selected.name}`}
          description="Re-enter the shop password to save these changes."
          confirmLabel="Save changes"
          onConfirm={saveChanges}
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
        <h2 className="text-lg font-black text-foreground">Manage credit owners</h2>
      </div>

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
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => openEdit(c)}
            className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-accent"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary">
              <User className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{c.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.contact || "No contact"}
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{fmtMoney(balanceOf(c))}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">No customers found.</p>
        )}
      </div>
    </div>
  );
}
