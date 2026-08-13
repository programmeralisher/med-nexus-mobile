import * as React from "react";

export type EntryType = "item" | "payment";

export interface Entry {
  id: string;
  type: EntryType;
  description: string;
  amount: number;
  date: string; // ISO
}

export interface Customer {
  id: string;
  name: string;
  contact: string;
  entries: Entry[];
  paidMonths: string[]; // e.g. "2026-08"
  updatedAt: string; // ISO
}

export interface HistoryItem {
  id: string;
  at: string;
  text: string;
}

export interface Settings {
  theme: "light" | "dark";
  whatsapp: string;
}

export interface AppData {
  customers: Customer[];
  history: HistoryItem[];
  settings: Settings;
}

const KEY = "zeeshan-medical-khatta-v1";

export const STORE_PASSWORD = "store123";

const defaultData: AppData = {
  customers: [],
  history: [],
  settings: { theme: "light", whatsapp: "" },
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export const monthKey = (d: Date | string = new Date()) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

export const fmtMoney = (n: number) =>
  "Rs " + Math.round(n).toLocaleString("en-PK", { maximumFractionDigits: 0 });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const balanceOf = (c: Customer) =>
  c.entries.reduce((s, e) => s + (e.type === "item" ? e.amount : -e.amount), 0);

export const paidTotalOf = (c: Customer) =>
  c.entries.filter((e) => e.type === "payment").reduce((s, e) => s + e.amount, 0);

export const lastPaymentOf = (c: Customer) =>
  c.entries
    .filter((e) => e.type === "payment")
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))[0];

function load(): AppData {
  if (typeof window === "undefined") return defaultData;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw) as AppData;
    return { ...defaultData, ...parsed, settings: { ...defaultData.settings, ...parsed.settings } };
  } catch {
    return defaultData;
  }
}

export function useAppStore() {
  const [data, setData] = React.useState<AppData>(defaultData);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setData(load());
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(KEY, JSON.stringify(data));
    document.documentElement.classList.toggle("dark", data.settings.theme === "dark");
  }, [data, ready]);

  const log = React.useCallback((text: string) => {
    setData((d) => ({
      ...d,
      history: [{ id: uid(), at: new Date().toISOString(), text }, ...d.history].slice(0, 500),
    }));
  }, []);

  const updateCustomer = React.useCallback(
    (id: string, fn: (c: Customer) => Customer) => {
      setData((d) => ({
        ...d,
        customers: d.customers.map((c) =>
          c.id === id ? { ...fn(c), updatedAt: new Date().toISOString() } : c,
        ),
      }));
    },
    [],
  );

  const api = React.useMemo(
    () => ({
      addCustomer(name: string, contact: string) {
        const c: Customer = {
          id: uid(),
          name,
          contact,
          entries: [],
          paidMonths: [],
          updatedAt: new Date().toISOString(),
        };
        setData((d) => ({ ...d, customers: [c, ...d.customers] }));
        log(`Created new ledger for ${name}`);
        return c;
      },
      deleteCustomer(id: string) {
        setData((d) => {
          const c = d.customers.find((x) => x.id === id);
          return {
            ...d,
            customers: d.customers.filter((x) => x.id !== id),
            history: c
              ? [
                  { id: uid(), at: new Date().toISOString(), text: `Deleted ledger of ${c.name}` },
                  ...d.history,
                ]
              : d.history,
          };
        });
      },
      addEntry(customerId: string, entry: Omit<Entry, "id">) {
        const e: Entry = { ...entry, id: uid() };
        updateCustomer(customerId, (c) => ({ ...c, entries: [...c.entries, e] }));
        setData((d) => {
          const name = d.customers.find((c) => c.id === customerId)?.name ?? "";
          return {
            ...d,
            history: [
              {
                id: uid(),
                at: new Date().toISOString(),
                text:
                  entry.type === "payment"
                    ? `Recorded payment ${fmtMoney(entry.amount)} in ${name}'s ledger`
                    : `Added "${entry.description}" ${fmtMoney(entry.amount)} in ${name}'s ledger`,
              },
              ...d.history,
            ],
          };
        });
      },
      editEntry(customerId: string, entryId: string, patch: Partial<Entry>) {
        updateCustomer(customerId, (c) => ({
          ...c,
          entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
        }));
      },
      removeEntry(customerId: string, entryId: string) {
        updateCustomer(customerId, (c) => ({
          ...c,
          entries: c.entries.filter((e) => e.id !== entryId),
        }));
        log(`Erased an entry from a ledger`);
      },
      markPaid(customerId: string, month: string) {
        updateCustomer(customerId, (c) => ({
          ...c,
          paidMonths: c.paidMonths.includes(month) ? c.paidMonths : [...c.paidMonths, month],
        }));
        log(`Marked ${month} as paid`);
      },
      setSettings(patch: Partial<Settings>) {
        setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
      },
      log,
    }),
    [log, updateCustomer],
  );

  return { data, ready, ...api };
}

export type Store = ReturnType<typeof useAppStore>;
