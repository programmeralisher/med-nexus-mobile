import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STORE_PASSWORD, balanceOf, fmtDateTime, fmtMoney, type Store } from "@/lib/store";
import { downloadBackupPdf } from "@/lib/pdf";
import {
  Download,
  History,
  LogOut,
  Moon,
  Search,
  Sun,
  Trash2,
  Upload,
  UserCog,
  ArchiveRestore,
} from "lucide-react";

export function SettingsScreen({
  store,
  onManageOwners,
  onBulkImport,
  onRecoverDeleted,
  onSignOut,
}: {
  store: Store;
  onManageOwners: () => void;
  onBulkImport: () => void;
  onRecoverDeleted: () => void;
  onSignOut: () => void;
}) {
  const { settings } = store.data;
  const [wa, setWa] = React.useState(settings.whatsapp);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteQuery, setDeleteQuery] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pwd, setPwd] = React.useState("");
  const [err, setErr] = React.useState("");
  const [historyOpen, setHistoryOpen] = React.useState(false);

  React.useEffect(() => setWa(settings.whatsapp), [settings.whatsapp]);

  // NEW: reused, simple case-insensitive substring filter -- same pattern
  // already used in CreditsScreen and ManageCreditOwnersScreen, not the
  // heavier searchable-combobox pattern from Bulk Entry, which is built for
  // a different context (picking a customer while typing a new row, with
  // an "add new" fallback). This dialog only ever picks among EXISTING
  // customers, so the simpler pattern is the right fit.
  const filteredForDelete = store.data.customers.filter((c) =>
    c.name.toLowerCase().includes(deleteQuery.trim().toLowerCase()),
  );

  const confirmDelete = () => {
    if (pwd !== STORE_PASSWORD) {
      setErr("Wrong password");
      return;
    }
    if (pendingId) store.deleteCustomer(pendingId);
    setPendingId(null);
    setPwd("");
    setErr("");
    setDeleteOpen(false);
  };

  return (
    <div className="space-y-4">
      <Section title="Appearance">
        <Button
          variant="outline"
          className="h-11 w-full justify-start"
          onClick={() => store.setSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
        >
          {settings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          Switch to {settings.theme === "dark" ? "light" : "dark"} theme
        </Button>
      </Section>

      <Section title="WhatsApp number">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            value={wa}
            onChange={(e) => setWa(e.target.value)}
            placeholder="Connected number e.g. 03001234567"
          />
          <Button
            className="shrink-0"
            onClick={() => {
              store.setSettings({ whatsapp: wa.trim() });
              store.log(`Changed connected WhatsApp number`);
            }}
          >
            Save
          </Button>
        </div>
      </Section>

      <Section title="Customer records">
        <Button variant="outline" className="h-11 w-full justify-start" onClick={onManageOwners}>
          <UserCog className="h-4 w-4" /> Manage credit owners
        </Button>
        <Button variant="outline" className="mt-2 h-11 w-full justify-start" onClick={onBulkImport}>
          <Upload className="h-4 w-4" /> Bulk Entry
        </Button>
      </Section>

      <Section title="Delete a credit">
        <Button
          variant="outline"
          className="h-11 w-full justify-start"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> Choose a ledger to delete
        </Button>
      </Section>

      <Section title="Recover deleted credits">
        <Button variant="outline" className="h-11 w-full justify-start" onClick={onRecoverDeleted}>
          <ArchiveRestore className="h-4 w-4" /> Recover deleted credits
        </Button>
      </Section>

      <Section title="Data">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-11 justify-start"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="h-4 w-4" /> See history
          </Button>
          <Button
            variant="outline"
            className="h-11 justify-start"
            onClick={() => downloadBackupPdf(store.data)}
          >
            <Download className="h-4 w-4" /> Backup all data (PDF)
          </Button>
        </div>
      </Section>

      <Button variant="destructive" className="h-11 w-full" onClick={onSignOut}>
        <LogOut className="h-4 w-4" /> Sign out
      </Button>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (open) setDeleteQuery("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete a credit ledger</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={deleteQuery}
              onChange={(e) => setDeleteQuery(e.target.value)}
              placeholder="Search by name"
              className="pl-9"
            />
          </div>
          <div className="max-h-60 space-y-2 overflow-auto">
            {filteredForDelete.map((c) => (
              <button
                key={c.id}
                onClick={() => setPendingId(c.id)}
                className={
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3 text-left " +
                  (pendingId === c.id ? "border-destructive bg-destructive/10" : "border-border")
                }
              >
                <span className="truncate font-medium text-foreground">{c.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmtMoney(balanceOf(c))}
                </span>
              </button>
            ))}
            {store.data.customers.length === 0 && (
              <p className="text-sm text-muted-foreground">No ledgers.</p>
            )}
            {store.data.customers.length > 0 && filteredForDelete.length === 0 && (
              <p className="text-sm text-muted-foreground">No matches.</p>
            )}
          </div>
          <Input
            type="password"
            placeholder="Enter password to delete"
            value={pwd}
            onChange={(e) => {
              setPwd(e.target.value);
              setErr("");
            }}
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <DialogFooter>
            <Button
              variant="destructive"
              className="w-full"
              disabled={!pendingId}
              onClick={confirmDelete}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recent activity</DialogTitle>
          </DialogHeader>
          <div className="max-h-80 space-y-2 overflow-auto">
            {store.data.history.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            )}
            {store.data.history.map((h) => (
              <div key={h.id} className="rounded-xl border border-border p-3">
                <p className="text-sm text-foreground">{h.text}</p>
                <p className="text-xs text-muted-foreground">{fmtDateTime(h.at)}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-bold text-foreground">{title}</h3>
      {children}
    </div>
  );
}
