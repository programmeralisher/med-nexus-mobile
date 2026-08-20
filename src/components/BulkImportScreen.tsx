import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  validateSheetRows,
  commitBulkSheet,
  type SheetRow,
  type RowCustomer,
  type BulkImportProgress,
  type BulkImportResult,
} from "@/lib/bulkImport";
import { fmtMoney, type Store } from "@/lib/store";
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from "lucide-react";

const BLANK_ROWS = 6;

function makeBlankRow(): SheetRow {
  return { key: Math.random().toString(36).slice(2), customer: null, description: "", price: "" };
}

/**
 * Bulk Entry / Bulk Sheet -- Settings -> Bulk Entry. A spreadsheet-style
 * table for adding many normal credit/item entries at once. Every row
 * becomes a normal ledger entry (same schema, same balance math, same
 * sync) -- see src/lib/bulkImport.ts for the write logic and the reasoning
 * behind every design choice (item-only, no date column, all-or-nothing
 * validation, etc).
 */
export function BulkImportScreen({ store, onBack }: { store: Store; onBack: () => void }) {
  const [rows, setRows] = React.useState<SheetRow[]>(() =>
    Array.from({ length: BLANK_ROWS }, makeBlankRow),
  );
  const [importing, setImporting] = React.useState(false);
  const [progress, setProgress] = React.useState<BulkImportProgress | null>(null);
  const [result, setResult] = React.useState<BulkImportResult | null>(null);
  const [commitError, setCommitError] = React.useState<string | null>(null);
  const priceRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const { valid, errors } = React.useMemo(() => validateSheetRows(rows), [rows]);
  const canImport = !importing && valid.length > 0 && errors.size === 0;

  const updateRow = (key: string, patch: Partial<SheetRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((rs) => [...rs, makeBlankRow()]);

  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const handlePriceEnter = (key: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    const isLastRow = rows[rows.length - 1]?.key === key;
    if (!isLastRow) return; // let normal Tab order move to the next row's fields
    e.preventDefault();
    const newRow = makeBlankRow();
    setRows((rs) => [...rs, newRow]);
    // Focus lands on the new row's price-adjacent field naturally isn't
    // possible for the combobox (a button, not a text input) without extra
    // wiring -- skipped deliberately to keep this simple, per the brief's
    // "no unnecessary complexity" instruction. The new row is visible and
    // ready either way.
  };

  const handleImport = async () => {
    if (!canImport) return;
    setImporting(true);
    setCommitError(null);
    setProgress(null);
    try {
      const res = await commitBulkSheet(valid, setProgress);
      setResult(res);
      setRows(Array.from({ length: BLANK_ROWS }, makeBlankRow));
    } catch (err) {
      setCommitError(
        `Import stopped: ${err instanceof Error ? err.message : String(err)}. ` +
          (progress
            ? `${progress.completedChunks} of ${progress.totalChunks} batches completed before this -- those entries were saved; the rest were not.`
            : "No batches completed before this happened."),
      );
    } finally {
      setImporting(false);
    }
  };

  const startOver = () => {
    setResult(null);
    setCommitError(null);
    setProgress(null);
    setRows(Array.from({ length: BLANK_ROWS }, makeBlankRow));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-black text-foreground">Bulk entry</h2>
      </div>

      {result ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-bold">Import complete</p>
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>{result.entriesCreated} entries created</li>
            <li>{result.customersCreated} new customers created</li>
            <li>{result.customersTouched} customers updated in total</li>
          </ul>
          <Button className="h-11 w-full" onClick={startOver}>
            Enter more
          </Button>
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Pick a customer, type a description and price for each row. Blank rows are ignored --
            fill in only what you need. Every row becomes a normal credit entry in that customer's
            ledger.
          </p>

          <div className="mt-3 flex-1 overflow-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-secondary text-secondary-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">S.No</th>
                  <th className="px-3 py-2 text-left font-semibold">Customer</th>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="px-3 py-2 text-right font-semibold">Price</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row, i) => {
                  const error = errors.get(row.key);
                  return (
                    <tr key={row.key} className={error ? "bg-destructive/5" : undefined}>
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      <td className="min-w-40 px-2 py-1.5">
                        <CustomerCell
                          value={row.customer}
                          customers={store.data.customers}
                          onChange={(c) => updateRow(row.key, { customer: c })}
                        />
                      </td>
                      <td className="min-w-36 px-2 py-1.5">
                        <input
                          className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={row.description}
                          onChange={(e) => updateRow(row.key, { description: e.target.value })}
                          placeholder="Panadol"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          ref={(el) => {
                            priceRefs.current[row.key] = el;
                          }}
                          className="w-24 rounded-md border border-input bg-transparent px-2 py-1.5 text-right text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={row.price}
                          inputMode="numeric"
                          onChange={(e) => updateRow(row.key, { price: e.target.value })}
                          onKeyDown={(e) => handlePriceEnter(row.key, e)}
                          placeholder="40"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <button
                          onClick={() => removeRow(row.key)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {errors.size > 0 && (
            <p className="mt-2 text-xs text-destructive">
              {errors.size} row{errors.size === 1 ? "" : "s"} need attention before you can import
              -- highlighted above.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="h-10 flex-1" onClick={addRow}>
              <Plus className="h-4 w-4" /> Add row
            </Button>
            <Button className="h-10 flex-[2]" onClick={handleImport} disabled={!canImport}>
              {importing
                ? progress
                  ? `Importing... batch ${progress.completedChunks} of ${progress.totalChunks}`
                  : "Importing..."
                : valid.length > 0
                  ? `Import ${valid.length} ${valid.length === 1 ? "entry" : "entries"}`
                  : "Import"}
            </Button>
          </div>

          {commitError && (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {commitError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CustomerCell({
  value,
  customers,
  onChange,
}: {
  value: RowCustomer | null;
  customers: Store["data"]["customers"];
  onChange: (c: RowCustomer | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const exactMatch = customers.some(
    (c) => c.name.trim().toLowerCase() === search.trim().toLowerCase(),
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-2 text-left text-sm"
        >
          {value ? (
            <span className={"truncate " + (value.kind === "new" ? "text-primary" : "")}>
              {value.name}
              {value.kind === "new" ? " (new)" : ""}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">Select...</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search customers..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No matching customer.</CommandEmpty>
            <CommandGroup>
              {filtered.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange({ kind: "existing", id: c.id, name: c.name });
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
            {search.trim() && !exactMatch && (
              <CommandGroup>
                <CommandItem
                  value={`__new__${search.trim()}`}
                  onSelect={() => {
                    onChange({ kind: "new", name: search.trim() });
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  + Add new customer &quot;{search.trim()}&quot;
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
