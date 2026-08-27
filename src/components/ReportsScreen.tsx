import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  balanceOf,
  fmtMoney,
  lastPaymentOf,
  monthKey,
  type Customer,
  type Store,
} from "@/lib/store";
import { downloadReportsPdf } from "@/lib/pdf";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

export function ReportsScreen({ store }: { store: Store }) {
  const [confirm, setConfirm] = React.useState<Customer | null>(null);
  // NEW: which month Reports is currently viewing. Day fixed to 1 so
  // shifting months (e.g. from a 31-day month) can never roll over into
  // the wrong month. Starts on the current month, same as before.
  const [viewedDate, setViewedDate] = React.useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const mk = monthKey(viewedDate);
  const monthName = viewedDate.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const isCurrentMonth = monthKey(viewedDate) === monthKey(new Date());

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Previous month"
            onClick={() => setViewedDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="truncate text-lg font-black text-foreground">Reports · {monthName}</h2>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Next month"
            onClick={() => setViewedDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={() => downloadReportsPdf(store.data.customers)}
        >
          <Download className="h-4 w-4" /> PDF
        </Button>
      </div>

      {!isCurrentMonth && (
        <button
          onClick={() =>
            setViewedDate(() => {
              const d = new Date();
              d.setDate(1);
              return d;
            })
          }
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Back to current month
        </button>
      )}

      {store.data.customers.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No ledgers yet.
        </p>
      )}

      <div className="space-y-2">
        {store.data.customers.map((c, i) => {
          const paid = c.paidMonths.includes(mk);
          const last = lastPaymentOf(c);
          return (
            <div
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {i + 1}. {c.name}{" "}
                  <span className="font-black text-destructive">{fmtMoney(balanceOf(c))}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {last ? `Last paid ${fmtMoney(last.amount)}` : "No payment yet"} ·{" "}
                  {c.contact || "no contact"}
                </p>
              </div>
              {paid ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                    Paid for {monthName}
                  </span>
                  <button
                    onClick={() => store.markUnpaid(c.id, mk)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <Button
                  variant="success"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setConfirm(c)}
                >
                  Mark as paid
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Are you sure you want to mark payment for {monthName} of {confirm?.name}?
            </DialogTitle>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirm(null)}>
              No
            </Button>
            <Button
              variant="success"
              className="flex-1"
              onClick={() => {
                if (confirm) store.markPaid(confirm.id, mk);
                setConfirm(null);
              }}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
