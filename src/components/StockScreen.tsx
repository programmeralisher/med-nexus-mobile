import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { perTablet, useStock, type StockItem } from "@/lib/stock";
import { ArrowLeft, Pencil, Plus, Search, Trash2, X } from "lucide-react";

const rs = (n: number) => `Rs ${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** "" -> null (optional). Invalid/negative -> undefined (error). */
function optNum(s: string): number | null | undefined {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

const EMPTY = { name: "", perPacket: "", price: "", quantity: "", notes: "", available: true };

export function StockScreen({ onBack }: { onBack: () => void }) {
  const { items, tags, ready, syncMessage, saveItem, removeItem, setAvailable, addTag, removeTag } =
    useStock();

  const [tagId, setTagId] = React.useState("tablet");
  const [form, setForm] = React.useState(EMPTY);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState("");

  const [tagFormOpen, setTagFormOpen] = React.useState(false);
  const [tagName, setTagName] = React.useState("");
  const [tagPacket, setTagPacket] = React.useState(false);
  const [tagErr, setTagErr] = React.useState("");

  const [filter, setFilter] = React.useState("all");
  const [query, setQuery] = React.useState("");

  const tagOf = (id: string) => tags.find((t) => t.id === id);
  const activeTag = tagOf(tagId) ?? tags[0];
  const isPacket = activeTag?.packet ?? false;
  const set = (patch: Partial<typeof EMPTY>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErr("");
  };

  const reset = () => {
    setForm(EMPTY);
    setEditingId(null);
    setErr("");
  };

  const submit = () => {
    if (!activeTag) return;
    const perPacket = isPacket ? optNum(form.perPacket) : null;
    const price = optNum(form.price);
    const quantity = optNum(form.quantity);
    if (perPacket === undefined || price === undefined || quantity === undefined) {
      setErr("Numbers must be 0 or more");
      return;
    }
    if (perPacket !== null && !Number.isInteger(perPacket)) {
      setErr("Tablets per packet must be a whole number");
      return;
    }
    const error = saveItem(
      {
        tagId: activeTag.id,
        name: form.name,
        tabletsPerPacket: perPacket,
        price,
        quantity,
        notes: form.notes,
        available: form.available,
      },
      editingId ?? undefined,
    );
    if (error) {
      setErr(error);
      return;
    }
    reset();
  };

  const startEdit = (it: StockItem) => {
    setEditingId(it.id);
    setTagId(it.tagId);
    setForm({
      name: it.name,
      perPacket: it.tabletsPerPacket == null ? "" : String(it.tabletsPerPacket),
      price: it.price == null ? "" : String(it.price),
      quantity: it.quantity == null ? "" : String(it.quantity),
      notes: it.notes,
      available: it.available,
    });
    setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createTag = () => {
    const r = addTag(tagName, tagPacket);
    if (r.error) {
      setTagErr(r.error);
      return;
    }
    if (r.id) setTagId(r.id);
    setTagName("");
    setTagPacket(false);
    setTagErr("");
    setTagFormOpen(false);
  };

  const dropTag = (id: string) => {
    const t = tagOf(id);
    if (!t || !window.confirm(`Delete the tag "${t.name}"?`)) return;
    const e = removeTag(id);
    if (e) {
      window.alert(e);
      return;
    }
    if (filter === id) setFilter("all");
    if (tagId === id) setTagId("tablet");
  };

  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => {
    if (filter !== "all" && i.tagId !== filter) return false;
    if (!q) return true;
    return (
      i.name.toLowerCase().includes(q) ||
      i.notes.toLowerCase().includes(q) ||
      (tagOf(i.tagId)?.name.toLowerCase().includes(q) ?? false)
    );
  });

  const chip = (on: boolean) =>
    "inline-flex h-8 items-center gap-1 rounded-full px-3 text-sm font-medium transition-colors " +
    (on
      ? "bg-primary text-primary-foreground"
      : "border border-border bg-card text-foreground hover:bg-accent");

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="-ml-2 h-9" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-base font-bold text-foreground">Stock</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Your personal stock list. Not connected to credit, recovery or reports.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Total items</p>
        <p className="text-2xl font-black text-foreground">{items.length}</p>
      </div>

      {syncMessage && (
        <p className="break-words rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {syncMessage}
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">
          {editingId ? "Edit item" : "Add item"}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center">
              <button
                type="button"
                className={chip(t.id === activeTag?.id)}
                onClick={() => {
                  setTagId(t.id);
                  setErr("");
                }}
                disabled={!!editingId && t.id !== activeTag?.id}
              >
                {t.name}
              </button>
              {!t.builtin && !editingId && (
                <button
                  type="button"
                  aria-label={`Delete tag ${t.name}`}
                  className="-ml-1 rounded-full p-1 text-muted-foreground hover:text-destructive"
                  onClick={() => dropTag(t.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
          {!editingId && (
            <button type="button" className={chip(false)} onClick={() => setTagFormOpen((o) => !o)}>
              <Plus className="h-4 w-4" /> Add Tag
            </button>
          )}
        </div>

        {tagFormOpen && !editingId && (
          <div className="space-y-2 rounded-xl border border-border p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                value={tagName}
                onChange={(e) => {
                  setTagName(e.target.value);
                  setTagErr("");
                }}
                placeholder="New tag, e.g. General"
              />
              <Button onClick={createTag}>Create</Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={tagPacket}
                onChange={(e) => setTagPacket(e.target.checked)}
              />
              Ask for tablets per packet (auto per-tablet price)
            </label>
            {tagErr && <p className="text-sm text-destructive">{tagErr}</p>}
          </div>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            className={isPacket ? "" : "sm:col-span-2"}
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={`${activeTag?.name ?? "Item"} name with power, e.g. Cefim 200mg *`}
          />
          {isPacket && (
            <Input
              type="number"
              inputMode="numeric"
              min="0"
              value={form.perPacket}
              onChange={(e) => set({ perPacket: e.target.value })}
              placeholder="Tablets in one packet"
            />
          )}
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            value={form.price}
            onChange={(e) => set({ price: e.target.value })}
            placeholder={isPacket ? "Packet price" : "Price"}
          />
          <Input
            type="number"
            inputMode="numeric"
            min="0"
            value={form.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            placeholder={isPacket ? "Packets in stock" : "Quantity in stock"}
          />
          <Input
            className="sm:col-span-2"
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Notes (optional)"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={form.available}
            onChange={(e) => set({ available: e.target.checked })}
          />
          Available
        </label>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex gap-2">
          <Button className="h-11 flex-1" onClick={submit}>
            {editingId ? (
              "Save changes"
            ) : (
              <>
                <Plus className="h-4 w-4" /> Add to Inventory
              </>
            )}
          </Button>
          {editingId && (
            <Button variant="outline" className="h-11" onClick={reset}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Filter stock
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(filter === "all")} onClick={() => setFilter("all")}>
            All ({items.length})
          </button>
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={chip(filter === t.id)}
              onClick={() => setFilter(t.id)}
            >
              {t.name} ({items.filter((i) => i.tagId === t.id).length})
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search stock..."
        />
      </div>

      {ready && shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "No stock added yet." : "No items match."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((it) => {
            const tag = tagOf(it.tagId);
            const pt = perTablet(it);
            return (
              <li key={it.id} className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words text-sm font-semibold text-foreground">{it.name}</p>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {tag?.name ?? "Untagged"}
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                      (it.available
                        ? "bg-success/15 text-success"
                        : "bg-destructive/15 text-destructive")
                    }
                  >
                    {it.available ? "Available" : "Not available"}
                  </span>
                </div>

                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {tag?.packet ? (
                    <>
                      {it.price != null && (
                        <p>
                          Packet price: <span className="text-foreground">{rs(it.price)}</span>
                          {it.tabletsPerPacket
                            ? ` · ${it.tabletsPerPacket} tablets per packet`
                            : ""}
                        </p>
                      )}
                      {pt != null && (
                        <p>
                          Per tablet:{" "}
                          <span className="font-semibold text-foreground">{rs(pt)}</span>
                        </p>
                      )}
                      {it.quantity != null && <p>Packets in stock: {it.quantity}</p>}
                    </>
                  ) : (
                    <>
                      {it.price != null && (
                        <p>
                          Price: <span className="text-foreground">{rs(it.price)}</span>
                        </p>
                      )}
                      {it.quantity != null && <p>In stock: {it.quantity}</p>}
                    </>
                  )}
                  {it.notes && <p className="text-foreground">Note: {it.notes}</p>}
                </div>

                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(it)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAvailable(it.id, !it.available)}
                  >
                    {it.available ? "Mark unavailable" : "Mark available"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete "${it.name}"?`)) {
                        if (editingId === it.id) reset();
                        removeItem(it.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
