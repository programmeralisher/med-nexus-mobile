import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Login } from "@/components/Login";
import { Dashboard } from "@/components/Dashboard";
import { CreditsScreen } from "@/components/CreditsScreen";
import { LedgerScreen } from "@/components/LedgerScreen";
import { ReportsScreen } from "@/components/ReportsScreen";
import { MessagesScreen } from "@/components/MessagesScreen";
import { SettingsScreen } from "@/components/SettingsScreen";
import { ManageCreditOwnersScreen } from "@/components/ManageCreditOwnersScreen";
import { BulkImportScreen } from "@/components/BulkImportScreen";
import { RecoverDeletedScreen } from "@/components/RecoverDeletedScreen";
import { useAppStore } from "@/lib/store";
import { isAppUnlocked, setAppUnlocked } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { BarChart3, MessageCircle, Settings, Stethoscope, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zeeshan Medical Store Khatta App" },
      {
        name: "description",
        content:
          "Credit ledger app for Zeeshan Medical Store: track khatta, recoveries, monthly reports and WhatsApp reminders.",
      },
      { property: "og:title", content: "Zeeshan Medical Store Khatta App" },
      {
        property: "og:description",
        content: "Track customer credit, payments, reports and WhatsApp reminders in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tab = "dashboard" | "credits" | "reports" | "messages" | "settings";

function Index() {
  const store = useAppStore();
  // Persistent login / session restore: seed `authed` from the local app
  // password gate (see isAppUnlocked/setAppUnlocked in lib/auth.ts) via
  // useState's lazy-initializer form, the same pattern already used for
  // useAppStore's theme-restore fix -- evaluated once on mount, before the
  // first paint, so a device that already passed Login before doesn't
  // flash it again on a normal refresh or PWA reopen. isAppUnlocked()
  // safely returns false during SSR, same as loadLocalTheme() does.
  const [authed, setAuthed] = React.useState(() => isAppUnlocked());
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [ledgerId, setLedgerId] = React.useState<string | null>(null);
  const [manageOwnersOpen, setManageOwnersOpen] = React.useState(false);
  const [bulkImportOpen, setBulkImportOpen] = React.useState(false);
  const [recoverDeletedOpen, setRecoverDeletedOpen] = React.useState(false);

  if (!authed)
    return (
      <Login
        onSuccess={() => {
          setAppUnlocked(true);
          setAuthed(true);
        }}
      />
    );

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "credits", label: "Credits", icon: <Wallet className="h-4 w-4" /> },
    { id: "reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
    { id: "messages", label: "Send messages", icon: <MessageCircle className="h-4 w-4" /> },
    { id: "settings", label: "Setting", icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <button
            className="flex min-w-0 items-center gap-3 text-left"
            onClick={() => {
              setTab("dashboard");
              setLedgerId(null);
              setManageOwnersOpen(false);
              setBulkImportOpen(false);
              setRecoverDeletedOpen(false);
            }}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </span>
            <h1 className="truncate text-base font-black text-foreground sm:text-lg">
              Zeeshan medical store khatta app
            </h1>
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5">
        {tab === "dashboard" && (
          <div className="space-y-6">
            <Dashboard data={store.data} />
            <div className="grid gap-3">
              {tabs.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="h-14 w-full justify-start text-base font-semibold"
                  onClick={() => setTab(t.id)}
                >
                  {t.icon}
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {tab === "credits" &&
          (ledgerId ? (
            <LedgerScreen store={store} customerId={ledgerId} onBack={() => setLedgerId(null)} />
          ) : (
            <CreditsScreen store={store} onOpen={(c) => setLedgerId(c.id)} />
          ))}

        {tab === "reports" && <ReportsScreen store={store} />}
        {tab === "messages" && <MessagesScreen store={store} />}
        {tab === "settings" &&
          (manageOwnersOpen ? (
            <ManageCreditOwnersScreen store={store} onBack={() => setManageOwnersOpen(false)} />
          ) : bulkImportOpen ? (
            <BulkImportScreen store={store} onBack={() => setBulkImportOpen(false)} />
          ) : recoverDeletedOpen ? (
            <RecoverDeletedScreen store={store} onBack={() => setRecoverDeletedOpen(false)} />
          ) : (
            <SettingsScreen
              store={store}
              onManageOwners={() => setManageOwnersOpen(true)}
              onBulkImport={() => setBulkImportOpen(true)}
              onRecoverDeleted={() => setRecoverDeletedOpen(true)}
              onSignOut={() => {
                setAppUnlocked(false);
                setAuthed(false);
                setTab("dashboard");
                setManageOwnersOpen(false);
                setBulkImportOpen(false);
                setRecoverDeletedOpen(false);
              }}
            />
          ))}
      </main>

      <nav className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-5 gap-1 px-2 py-2">
          {[
            { id: "dashboard" as Tab, label: "Home", icon: <Stethoscope className="h-4 w-4" /> },
            ...tabs,
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                if (t.id !== "credits") setLedgerId(null);
                if (t.id !== "settings") {
                  setManageOwnersOpen(false);
                  setBulkImportOpen(false);
                  setRecoverDeletedOpen(false);
                }
              }}
              className={
                "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors " +
                (tab === t.id
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-accent")
              }
            >
              {t.icon}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
