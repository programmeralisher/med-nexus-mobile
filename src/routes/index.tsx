import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Login } from "@/components/Login";
import { Dashboard } from "@/components/Dashboard";
import { CreditsScreen } from "@/components/CreditsScreen";
import { LedgerScreen } from "@/components/LedgerScreen";
import { ReportsScreen } from "@/components/ReportsScreen";
import { MessagesScreen } from "@/components/MessagesScreen";
import { SettingsScreen } from "@/components/SettingsScreen";
import { useAppStore } from "@/lib/store";
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
  const [authed, setAuthed] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [ledgerId, setLedgerId] = React.useState<string | null>(null);

  if (!authed) return <Login onSuccess={() => setAuthed(true)} />;

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
        {tab === "settings" && (
          <SettingsScreen
            store={store}
            onSignOut={() => {
              setAuthed(false);
              setTab("dashboard");
            }}
          />
        )}
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
