import * as React from "react";
import { Button } from "@/components/ui/button";
import { useActivity, type ActivityRow } from "@/lib/activity";
import { ArrowLeft, Smartphone } from "lucide-react";

type Period = "today" | "week" | "month" | "year";
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/** 1:20 pm Mon 5-10-26 */
function fmtStamp(iso: string) {
  const d = new Date(iso);
  const time = d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
  const day = d.toLocaleDateString("en-GB", { weekday: "short" });
  return `${time} ${day} ${d.getDate()}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(2)}`;
}

function inPeriod(iso: string, p: Period) {
  const d = new Date(iso);
  const now = new Date();
  if (p === "today") return d.toDateString() === now.toDateString();
  if (p === "week") return now.getTime() - d.getTime() < 7 * 24 * 3600 * 1000;
  if (p === "month")
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  return d.getFullYear() === now.getFullYear();
}

export function ActivityScreen({ onBack }: { onBack: () => void }) {
  const { devices, rows, ready, error } = useActivity();
  const [period, setPeriod] = React.useState<Period>("today");
  const [deviceFilter, setDeviceFilter] = React.useState("all");

  const nameOf = (r: ActivityRow) => {
    if (r.deviceUid) {
      const live = devices.find((d) => d.uid === r.deviceUid);
      if (live && live.name !== "Unnamed device") return live.name;
      if (r.deviceName) return r.deviceName;
      return `Device ${r.deviceUid.slice(0, 6)}…`;
    }
    return r.deviceName ?? "Unknown device (before tracking)";
  };

  const shown = rows.filter(
    (r) => inPeriod(r.at, period) && (deviceFilter === "all" || r.deviceUid === deviceFilter),
  );

  const chip = (on: boolean) =>
    "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors " +
    (on
      ? "bg-primary text-primary-foreground"
      : "border border-border bg-card text-foreground hover:bg-accent");

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="-ml-2 h-9" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {error && (
        <p className="break-words rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-base font-bold text-foreground">Devices</h2>
        <p className="text-xs text-muted-foreground">
          Phones allowed to use this app. Add or remove one in Firebase → allowedDevices.
        </p>
        {ready && devices.length === 0 && (
          <p className="text-sm text-muted-foreground">No devices found.</p>
        )}
        <ul className="space-y-2">
          {devices.map((d) => (
            <li key={d.uid} className="flex items-start gap-3 rounded-xl border border-border p-3">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">
                  {d.name}
                  {d.isThisDevice && (
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                      This phone
                    </span>
                  )}
                </p>
                <p className="break-all font-mono text-[11px] text-muted-foreground">{d.uid}</p>
                <p className="text-xs text-muted-foreground">
                  Last active: {d.lastActive ? fmtStamp(d.lastActive) : "not seen yet"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-base font-bold text-foreground">Recent activity</h2>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={chip(period === p.id)}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={deviceFilter}
          onChange={(e) => setDeviceFilter(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
        >
          <option value="all">All devices</option>
          {devices.map((d) => (
            <option key={d.uid} value={d.uid}>
              {d.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {shown.length} {shown.length === 1 ? "activity" : "activities"}
        </p>

        {ready && shown.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No activity in this period.
          </p>
        ) : (
          <ol className="space-y-2">
            {shown.map((r, i) => (
              <li key={r.id} className="rounded-xl border border-border p-3">
                <p className="break-words text-sm text-foreground">
                  <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                  {r.text}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {fmtStamp(r.at)} · Device: {nameOf(r)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
