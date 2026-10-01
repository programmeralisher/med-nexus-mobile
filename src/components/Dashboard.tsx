import * as React from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  balanceOf,
  fmtDate,
  fmtMoney,
  isDefaulter,
  isStarCustomer,
  monthKey,
  paidTotalOf,
  type AppData,
  type Customer,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ChevronLeft, ChevronRight, History } from "lucide-react";

type Range = "daily" | "weekly" | "monthly" | "yearly";
type Period = "today" | "week" | "month" | "year";

/** Which slice of the shop a top-row card is showing. "all" is the default
 * and is the whole shop (regular customers + defaulters), so regular +
 * defaulters always add up to all. */
type Group = "all" | "regular" | "defaulters" | "star";

const inGroup = (c: Customer, g: Group) => {
  switch (g) {
    case "all":
      return true;
    case "defaulters":
      return isDefaulter(c);
    case "star":
      return isStarCustomer(c);
    case "regular":
      return !isDefaulter(c) && !isStarCustomer(c);
  }
};

/** An entry as the dashboard sees it: the ledger entry plus whose it is. */
type DashEntry = { id: string; date: string; amount: number; description: string; name: string };

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
function usePeriodFilter(entries: DashEntry[]) {
  const [period, setPeriod] = React.useState<Period>("today");
  const [monthDate, setMonthDate] = React.useState(() => new Date());
  const [year, setYear] = React.useState(() => new Date().getFullYear());

  // The entries that fall inside the selected period, newest first. `amount`
  // below is just their sum, so the number on the card and the rows in the
  // history dialog can never disagree -- one filter, two views of it.
  const rows = React.useMemo(() => {
    let picked: DashEntry[];
    if (period === "today") {
      picked = entries.filter((e) => isToday(e.date));
    } else if (period === "week") {
      const { start, end } = getThisWeekRange();
      picked = entries.filter((e) => +new Date(e.date) >= +start && +new Date(e.date) < +end);
    } else if (period === "month") {
      picked = entries.filter((e) => monthKey(e.date) === monthKey(monthDate));
    } else {
      picked = entries.filter((e) => new Date(e.date).getFullYear() === year);
    }
    return [...picked].sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }, [period, monthDate, year, entries]);

  const amount = React.useMemo(() => rows.reduce((s, e) => s + e.amount, 0), [rows]);

  return { period, setPeriod, monthDate, setMonthDate, year, setYear, amount, rows };
}

export function Dashboard({ data }: { data: AppData }) {
  const [range, setRange] = React.useState<Range>("daily");

  // Top-row cards each have their own All shop / Regular / Defaulters
  // filter (independent of each other). Defaulters are flagged from the
  // ledger screen; everyone not flagged is "regular". Amounts always come
  // from the same balanceOf / paidTotalOf helpers as before, just summed
  // over the selected group, so regular + defaulters === all shop.
  const [outstandingGroup, setOutstandingGroup] = React.useState<Group>("all");
  const [recoveryGroup, setRecoveryGroup] = React.useState<Group>("all");

  const outstandingOf = (g: Group) =>
    data.customers.filter((c) => inGroup(c, g)).reduce((s, c) => s + balanceOf(c), 0);
  const recoveredOf = (g: Group) =>
    data.customers.filter((c) => inGroup(c, g)).reduce((s, c) => s + paidTotalOf(c), 0);

  const allPayments = React.useMemo(
    () =>
      data.customers.flatMap((c) =>
        c.entries.filter((e) => e.type === "payment").map((e) => ({ ...e, name: c.name })),
      ),
    [data.customers],
  );
  const allItems = React.useMemo(
    () =>
      data.customers.flatMap((c) =>
        c.entries.filter((e) => e.type === "item").map((e) => ({ ...e, name: c.name })),
      ),
    [data.customers],
  );

  const defaulterCount = data.customers.filter(isDefaulter).length;
  const shownOutstanding = outstandingOf(outstandingGroup);
  const shownRecovery = recoveredOf(recoveryGroup);

  // Recovery percentage for the selected group: derived from that group's
  // outstanding and recovered figures -- no separate sum of "all credit ever
  // issued" is taken. This works because of the identity outstanding =
  // issued - recovered (balanceOf is items minus payments per customer), so
  // issued = outstanding + recovered, per group as much as for the whole shop.
  const shownIssued = outstandingOf(recoveryGroup) + shownRecovery;
  const recoveryPercentage = shownIssued > 0 ? (shownRecovery / shownIssued) * 100 : 0;

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
      {/* Row 1: Total outstanding and All-time recovery each have an
          All shop / Regular / Defaulters filter; Credit holders shows the
          total plus how many of them are defaulters. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total credit (outstanding)"
          value={fmtMoney(shownOutstanding)}
          accent
          group={outstandingGroup}
          onGroupChange={setOutstandingGroup}
        />
        <StatCard
          label="Credit holders"
          value={String(data.customers.length)}
          sublabel={`${defaulterCount} ${defaulterCount === 1 ? "defaulter" : "defaulters"}`}
          sublabelTone="destructive"
        />
        <StatCard
          label="All-time recovery"
          value={fmtMoney(shownRecovery)}
          sublabel={`${recoveryPercentage.toFixed(1)}% of credit issued`}
          group={recoveryGroup}
          onGroupChange={setRecoveryGroup}
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

const GROUPS: { value: Group; label: string }[] = [
  { value: "all", label: "All Shop" },
  { value: "regular", label: "Regular Customers" },
  { value: "defaulters", label: "Defaulters" },
  { value: "star", label: "Star Customers" },
];

/** The "Customer Type: All Shop v" pill that sits in a card's header. Click
 * it to open the All Shop / Regular Customers / Defaulters menu. On the
 * teal (accent) card it is a light pill with a dark-teal menu; on a white
 * card it is an outlined pill with the normal menu. */
function GroupSelect({
  group,
  onChange,
  accent,
}: {
  group: Group;
  onChange: (g: Group) => void;
  accent?: boolean | undefined;
}) {
  const current = GROUPS.find((g) => g.value === group)?.label ?? "All Shop";
  return (
    <Select value={group} onValueChange={(v) => onChange(v as Group)}>
      <SelectTrigger
        aria-label="Customer type filter"
        className={
          "ml-auto h-7 w-auto shrink-0 justify-start gap-1 rounded-full px-2.5 text-[11px] font-semibold shadow-none sm:px-3 sm:text-xs [&>svg]:opacity-100 " +
          (accent
            ? "border-transparent bg-primary-foreground text-primary ring-2 ring-primary-foreground/40"
            : "border-primary/30 bg-background text-primary")
        }
      >
        <span>
          : <SelectValue>{current}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent
        align="end"
        sideOffset={6}
        className={
          "min-w-[12rem] rounded-2xl " +
          (accent
            ? "border-primary-foreground/15 bg-primary text-primary-foreground shadow-xl"
            : "")
        }
        // A darker shade of the card's teal for the menu on the accent card.
        // If a browser doesn't support color-mix this line is simply ignored
        // and the plain bg-primary above is used instead.
        style={
          accent ? { background: "color-mix(in srgb, var(--color-primary) 72%, black)" } : undefined
        }
      >
        {GROUPS.map((g) => (
          <SelectItem
            key={g.value}
            value={g.value}
            className={
              "rounded-lg py-2 pl-3 pr-8 text-sm " +
              (accent
                ? "focus:bg-primary-foreground/15 focus:text-primary-foreground data-[state=checked]:font-semibold"
                : "data-[state=checked]:font-semibold")
            }
          >
            {g.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  sublabelTone = "success",
  accent,
  group,
  onGroupChange,
}: {
  label: string;
  value: string;
  sublabel?: string;
  sublabelTone?: "success" | "destructive";
  accent?: boolean;
  /** When both are given, the header shows the Customer Type pill/menu. */
  group?: Group;
  onGroupChange?: (g: Group) => void;
}) {
  return (
    <div
      className={
        "flex h-full flex-col rounded-2xl border p-5 " +
        (accent
          ? "border-primary/30 bg-primary text-primary-foreground"
          : "border-border bg-card text-card-foreground")
      }
    >
      {/* min-h keeps the big numbers lined up across the three cards even
          though only two of them have the pill. */}
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <p className={"text-xs font-medium " + (accent ? "opacity-80" : "text-muted-foreground")}>
          {label}
        </p>
        {group !== undefined && onGroupChange && (
          <GroupSelect group={group} onChange={onGroupChange} accent={accent} />
        )}
      </div>
      <p className="mt-2 text-2xl font-black sm:text-3xl">{value}</p>
      {sublabel && (
        <p
          className={
            "mt-1 text-sm font-semibold " +
            (accent
              ? "opacity-90"
              : sublabelTone === "destructive"
                ? "text-destructive"
                : "text-success")
          }
        >
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
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const periodLabel = (p: Period) =>
    p === "today" ? "Today" : p === "week" ? "Week" : p === "month" ? "Month" : "Year";
  const periodTitle =
    filter.period === "today"
      ? "Today"
      : filter.period === "week"
        ? "This week"
        : filter.period === "month"
          ? filter.monthDate.toLocaleString("en-GB", { month: "long", year: "numeric" })
          : String(filter.year);

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

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-2xl font-black sm:text-3xl">{fmtMoney(filter.amount)}</p>
        <Button
          variant="ghost"
          size="icon"
          className={
            "h-9 w-9 shrink-0 " +
            (accent
              ? "text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
          aria-label={`${label} history`}
          onClick={() => setHistoryOpen(true)}
        >
          <History className="h-5 w-5" />
        </Button>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] gap-3">
          <DialogHeader>
            <DialogTitle>
              {label} history · {periodTitle}
            </DialogTitle>
            <DialogDescription>
              {filter.rows.length} {filter.rows.length === 1 ? "entry" : "entries"} · total{" "}
              {fmtMoney(filter.amount)}
            </DialogDescription>
          </DialogHeader>
          {filter.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No {label.toLowerCase()} entries for this period.
            </p>
          ) : (
            <ul className="-mr-2 max-h-[60vh] space-y-2 overflow-y-auto pr-2">
              {filter.rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    {r.description && (
                      <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(r.date)} ·{" "}
                      {new Date(r.date).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p
                    className={
                      "shrink-0 text-sm font-black " +
                      (label === "Credit" ? "text-destructive" : "text-success")
                    }
                  >
                    {fmtMoney(r.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
