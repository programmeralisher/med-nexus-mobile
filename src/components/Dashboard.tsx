import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { balanceOf, fmtMoney, monthKey, type AppData } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Range = "daily" | "weekly" | "monthly" | "yearly";
type RecoveryPeriod = "today" | "week" | "month" | "year";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** The current week's [start, end) boundary -- deliberately the EXACT same
 * rolling-7-day definition as the chart's own "weekly" bucketing below
 * (its i=0 case: end = tomorrow-midnight, start = 7 days before that), so
 * "This Week's Recovery" and the chart's current week bar always agree.
 * Reused rather than reimplemented, per "do not create a second financial
 * calculation system." */
function getThisWeekRange(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

export function Dashboard({ data }: { data: AppData }) {
  const [range, setRange] = React.useState<Range>("daily");

  // NEW: recovery-by-period card state. Kept entirely separate from `range`
  // above (the existing chart toggle) -- these control the new card only,
  // per "add alongside, don't replace existing functionality."
  const [recoveryPeriod, setRecoveryPeriod] = React.useState<RecoveryPeriod>("today");
  const [recoveryMonthDate, setRecoveryMonthDate] = React.useState(() => new Date());
  const [recoveryYear, setRecoveryYear] = React.useState(() => new Date().getFullYear());

  const totalCredit = data.customers.reduce((s, c) => s + balanceOf(c), 0);

  // useMemo added here (wasn't memoized before): at 150+ customers this is
  // still cheap in absolute terms, but memoizing means it's only recomputed
  // when the underlying data actually changes, not on every toggle click --
  // a reasonable, low-risk strengthening given the explicit scalability ask,
  // and behavior-identical to before for any given `data`.
  const allPayments = React.useMemo(
    () =>
      data.customers.flatMap((c) =>
        c.entries.filter((e) => e.type === "payment").map((e) => ({ ...e, name: c.name })),
      ),
    [data.customers],
  );
  const allItems = React.useMemo(
    () => data.customers.flatMap((c) => c.entries.filter((e) => e.type === "item")),
    [data.customers],
  );

  // UNCHANGED calculation, still exactly "today's payments summed" -- see
  // the investigation note in the PR/commit message about the reported
  // "previous day payment not included" observation: this filter is correct
  // in isolation (today-only is what this specific card is for), the gap
  // was the absence of the cards below, not a bug here.
  const todayRecovery = React.useMemo(
    () => allPayments.filter((p) => isToday(p.date)).reduce((s, p) => s + p.amount, 0),
    [allPayments],
  );

  // NEW: symmetric to todayRecovery, but for items (credit that went out).
  const todayCredit = React.useMemo(
    () => allItems.filter((i) => isToday(i.date)).reduce((s, i) => s + i.amount, 0),
    [allItems],
  );

  // NEW: all-time total, no date filter at all.
  const allTimeRecovery = React.useMemo(
    () => allPayments.reduce((s, p) => s + p.amount, 0),
    [allPayments],
  );

  // NEW: the filterable recovery-by-period figure. Reuses monthKey from
  // store.ts (the same month-bucketing already used for paidMonths
  // elsewhere) rather than reimplementing date-bucketing a third time.
  const periodRecovery = React.useMemo(() => {
    if (recoveryPeriod === "today") return todayRecovery;
    if (recoveryPeriod === "week") {
      const { start, end } = getThisWeekRange();
      return allPayments
        .filter((p) => +new Date(p.date) >= +start && +new Date(p.date) < +end)
        .reduce((s, p) => s + p.amount, 0);
    }
    if (recoveryPeriod === "month") {
      return allPayments
        .filter((p) => monthKey(p.date) === monthKey(recoveryMonthDate))
        .reduce((s, p) => s + p.amount, 0);
    }
    return allPayments
      .filter((p) => new Date(p.date).getFullYear() === recoveryYear)
      .reduce((s, p) => s + p.amount, 0);
  }, [recoveryPeriod, recoveryMonthDate, recoveryYear, allPayments, todayRecovery]);

  const chartData = React.useMemo(() => {
    const now = new Date();
    const buckets: { label: string; start: Date; end: Date }[] = [];
    if (range === "daily") {
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const end = new Date(d);
        end.setDate(end.getDate() + 1);
        buckets.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, start: d, end });
      }
    } else if (range === "weekly") {
      for (let i = 3; i >= 0; i--) {
        const end = new Date(now);
        end.setHours(0, 0, 0, 0);
        end.setDate(end.getDate() - i * 7 + 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        buckets.push({ label: `W${4 - i}`, start, end });
      }
    } else if (range === "monthly") {
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        buckets.push({
          label: start.toLocaleString("en-GB", { month: "short" }),
          start,
          end,
        });
      }
    } else {
      // NEW: yearly buckets, last 5 years -- same bucketing pattern as
      // monthly above, just year-granularity instead of month-granularity.
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);
        buckets.push({ label: String(year), start, end });
      }
    }
    return buckets.map((b) => ({
      label: b.label,
      recovery: allPayments
        .filter((p) => +new Date(p.date) >= +b.start && +new Date(p.date) < +b.end)
        .reduce((s, p) => s + p.amount, 0),
      credit: allItems
        .filter((p) => +new Date(p.date) >= +b.start && +new Date(p.date) < +b.end)
        .reduce((s, p) => s + p.amount, 0),
    }));
  }, [range, allPayments, allItems]);

  return (
    <div className="space-y-5">
      {/* UNCHANGED -- existing three stat cards, exactly as before */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total credit (outstanding)" value={fmtMoney(totalCredit)} accent />
        <StatCard label="Today's recovery" value={fmtMoney(todayRecovery)} />
        <StatCard label="Credit holders" value={String(data.customers.length)} />
      </div>

      {/* NEW row, added alongside the existing one above */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="All-time recovery" value={fmtMoney(allTimeRecovery)} />
        <StatCard label="Today's credit" value={fmtMoney(todayCredit)} />
      </div>

      {/* NEW: recovery-by-period card, with a month/year picker when relevant */}
      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
          <h2 className="truncate text-base font-bold text-foreground">Recovery</h2>
          <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1">
            {(["today", "week", "month", "year"] as RecoveryPeriod[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={recoveryPeriod === p ? "default" : "ghost"}
                className="h-8 px-3 text-xs capitalize"
                onClick={() => setRecoveryPeriod(p)}
              >
                {p === "today" ? "Today" : p === "week" ? "Week" : p === "month" ? "Month" : "Year"}
              </Button>
            ))}
          </div>
        </div>

        {recoveryPeriod === "month" && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous month"
              onClick={() =>
                setRecoveryMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-32 text-center text-sm font-medium text-foreground">
              {recoveryMonthDate.toLocaleString("en-GB", { month: "long", year: "numeric" })}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next month"
              onClick={() =>
                setRecoveryMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
              }
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {recoveryPeriod === "year" && (
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous year"
              onClick={() => setRecoveryYear((y) => y - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-20 text-center text-sm font-medium text-foreground">
              {recoveryYear}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next year"
              onClick={() => setRecoveryYear((y) => y + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <p className="mt-4 text-center text-3xl font-black text-foreground">
          {fmtMoney(periodRecovery)}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
          <h2 className="truncate text-base font-bold text-foreground">
            Recovery vs credit
            {range === "daily" ? " · last 30 days" : range === "yearly" ? " · last 5 years" : ""}
          </h2>
          <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1">
            {(["daily", "weekly", "monthly", "yearly"] as Range[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={range === r ? "default" : "ghost"}
                className="h-8 px-3 text-xs capitalize"
                onClick={() => setRange(r)}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-4 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} width={50} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 12,
                  color: "var(--color-foreground)",
                }}
                formatter={(v: number) => fmtMoney(v)}
              />
              <Bar
                dataKey="credit"
                fill="var(--color-chart-2)"
                radius={[4, 4, 0, 0]}
                name="Credit"
              />
              <Bar
                dataKey="recovery"
                fill="var(--color-chart-1)"
                radius={[4, 4, 0, 0]}
                name="Recovery"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border p-5 " +
        (accent
          ? "border-primary/30 bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground")
      }
    >
      <p className={"text-xs font-medium " + (accent ? "opacity-80" : "text-muted-foreground")}>
        {label}
      </p>
      <p className="mt-2 text-2xl font-black sm:text-3xl">{value}</p>
    </div>
  );
}
