import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { balanceOf, fmtMoney, type AppData } from "@/lib/store";
import { Button } from "@/components/ui/button";

type Range = "daily" | "weekly" | "monthly";

export function Dashboard({ data }: { data: AppData }) {
  const [range, setRange] = React.useState<Range>("daily");

  const totalCredit = data.customers.reduce((s, c) => s + balanceOf(c), 0);

  const allPayments = data.customers.flatMap((c) =>
    c.entries.filter((e) => e.type === "payment").map((e) => ({ ...e, name: c.name })),
  );
  const allItems = data.customers.flatMap((c) => c.entries.filter((e) => e.type === "item"));

  const todayRecovery = allPayments
    .filter((p) => new Date(p.date).toDateString() === new Date().toDateString())
    .reduce((s, p) => s + p.amount, 0);

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
    } else {
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        buckets.push({
          label: start.toLocaleString("en-GB", { month: "short" }),
          start,
          end,
        });
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
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total credit (outstanding)" value={fmtMoney(totalCredit)} accent />
        <StatCard label="Today's recovery" value={fmtMoney(todayRecovery)} />
        <StatCard label="Credit holders" value={String(data.customers.length)} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
          <h2 className="truncate text-base font-bold text-foreground">
            Recovery vs credit{range === "daily" ? " · last 30 days" : ""}
          </h2>
          <div className="flex shrink-0 gap-1 rounded-xl bg-muted p-1">
            {(["daily", "weekly", "monthly"] as Range[]).map((r) => (
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
              <Bar dataKey="credit" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} name="Credit" />
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
  accent,
}: {
  label: string;
  value: string;
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
    </div>
  );
}
