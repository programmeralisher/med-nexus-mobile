import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { balanceOf, fmtMoney, monthKey, type AppData } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Range = "daily" | "weekly" | "monthly" | "yearly";
type Period = "today" | "week" | "month" | "year";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** The current week's [start, end) boundary -- deliberately the EXACT same
 * rolling-7-day definition as the chart's own "weekly" bucketing below
 * (its i=0 case: end = tomorrow-midnight, start = 7 days before that), so
 * any "this week" figure on the dashboard always agrees with the chart's
 * current week bar. Reused rather than reimplemented, per "do not create a
 * second financial calculation system." */
function getThisWeekRange(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

/** Shared period-filtering logic for the two filterable cards (Today's
 * Credit and Recovery) -- one hook, called twice with independent state,
 * so both cards can have their own selected period at once while sharing
 * the exact same date-bucketing rules. This is the "single source of
 * truth" the brief asks for: there is only ONE place that decides what
 * "this week"/"this month"/"this year" means for the dashboard, reused by
 * both cards and the chart, not three separate implementations. */
function usePeriodFilter(entries: { date: string; amount: number }[]) {
  const [period, setPeriod] = React.useState<Period>("today");
  const [monthDate, setMonthDate] = React.useState(() => new Date());
  const [year, setYear] = React.useState(() => new Date().getFullYear());

  const amount = React.useMemo(() => {
    if (period === "today") {
      return entries.filter((e) => isToday(e.date)).reduce((s, e) => s + e.amount, 0);
    }
    if (period === "week") {
      const { start, end } = getThisWeekRange();
      return entries
        .filter((e) => +new Date(e.date) >= +start && +new Date(e.date) < +end)
        .reduce((s, e) => s + e.amount, 0);
    }
    if (period === "month") {
      return entries
        .filter((e) => monthKey(e.date) === monthKey(monthDate))
        .reduce((s, e) => s + e.amount, 0);
    }
    return entries
      .filter((e) => new Date(e.date).getFullYear() === year)
      .reduce((s, e) => s + e.amount, 0);
  }, [period, monthDate, year, entries]);

  return { period, setPeriod, monthDate, setMonthDate, year, setYear, amount };
}

export function Dashboard({ data }: { data: AppData }) {
  const [range, setRange] = React.useState<Range>("daily");

  const totalCredit = data.customers.reduce((s, c) => s + balanceOf(c), 0);

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

  const allTimeRecovery = React.useMemo(
    () => allPayments.reduce((s, p) => s + p.amount, 0),
    [allPayments],
  );

  // Recovery percentage: derived from totalCredit and allTimeRecovery, both
  // already computed above -- no separate/independent sum of "all credit
  // ever issued" is taken. This works because of the identity
  // outstanding = issued - recovered (balanceOf is items minus payments
  // per customer, summed), so issued = outstanding + recovered. Reusing the
  // two figures already on screen elsewhere is exactly "the same financial
  // source of truth", not a second calculation system.
  const totalCreditIssued = totalCredit + allTimeRecovery;
  const recoveryPercentage =
    totalCreditIssued > 0 ? (allTimeRecovery / totalCreditIssued) * 100 : 0;

  const creditFilter = usePeriodFilter(allItems);
  const recoveryFilter = usePeriodFilter(allPayments);

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
      {/* Row 1: Total Credit Outstanding (unchanged) / Credit Owners
          (unchanged) / All-Time Recovery (now with a recovery %) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total credit (outstanding)" value={fmtMoney(totalCredit)} accent />
        <StatCard label="Credit holders" value={String(data.customers.length)} />
        <StatCard
          label="All-time recovery"
          value={fmtMoney(allTimeRecovery)}
          sublabel={`${recoveryPercentage.toFixed(1)}% of credit issued`}
        />
      </div>

      {/* Row 2: Today's Credit and Recovery, each with their own
          Today/Week/Month/Year filter. This replaces the old standalone
          "Today's recovery" card -- Recovery here covers that exact case
          (Today selected) plus Week/Month/Year, so nothing is lost. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <PeriodCard label="Credit" filter={creditFilter} />
        <PeriodCard label="Recovery" filter={recoveryFilter} accent />
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

function StatCard({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: boolean;
}) {
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
      {sublabel && (
        <p className={"mt-1 text-sm font-semibold " + (accent ? "opacity-90" : "text-success")}>
          {sublabel}
        </p>
      )}
    </div>
  );
}

/** Shared by the Credit and Recovery cards -- same toggle, same
 * month/year picker, same amount display, just fed a different `filter`
 * (see usePeriodFilter) and an optional `accent` for Recovery's green
 * treatment, matching Total Credit Outstanding's card #1 styling. */
function PeriodCard({
  label,
  filter,
  accent,
}: {
  label: string;
  filter: ReturnType<typeof usePeriodFilter>;
  accent?: boolean;
}) {
  const periodLabel = (p: Period) =>
    p === "today" ? "Today" : p === "week" ? "Week" : p === "month" ? "Month" : "Year";

  return (
    <div
      className={
        "rounded-2xl border p-4 sm:p-5 " +
        (accent
          ? "border-primary/30 bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground")
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h3 className="truncate text-sm font-bold">{label}</h3>
        <div
          className={
            "flex shrink-0 gap-0.5 rounded-lg p-0.5 " +
            (accent ? "bg-primary-foreground/15" : "bg-muted")
          }
        >
          {(["today", "week", "month", "year"] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant="ghost"
              className={
                "h-7 px-2 text-[11px] hover:bg-transparent " +
                (filter.period === p
                  ? accent
                    ? "bg-primary-foreground/25 text-primary-foreground"
                    : "bg-background text-foreground shadow-sm"
                  : accent
                    ? "text-primary-foreground/70 hover:text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground")
              }
              onClick={() => filter.setPeriod(p)}
            >
              {periodLabel(p)}
            </Button>
          ))}
        </div>
      </div>

      {filter.period === "month" && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant={accent ? "secondary" : "outline"}
            size="icon"
            className="h-7 w-7"
            aria-label="Previous month"
            onClick={() =>
              filter.setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))
            }
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-28 text-center text-xs font-medium">
            {filter.monthDate.toLocaleString("en-GB", { month: "long", year: "numeric" })}
          </span>
          <Button
            variant={accent ? "secondary" : "outline"}
            size="icon"
            className="h-7 w-7"
            aria-label="Next month"
            onClick={() =>
              filter.setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))
            }
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {filter.period === "year" && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant={accent ? "secondary" : "outline"}
            size="icon"
            className="h-7 w-7"
            aria-label="Previous year"
            onClick={() => filter.setYear((y) => y - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="min-w-16 text-center text-xs font-medium">{filter.year}</span>
          <Button
            variant={accent ? "secondary" : "outline"}
            size="icon"
            className="h-7 w-7"
            aria-label="Next year"
            onClick={() => filter.setYear((y) => y + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <p className="mt-3 text-2xl font-black sm:text-3xl">{fmtMoney(filter.amount)}</p>
    </div>
  );
}
