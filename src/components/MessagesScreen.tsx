import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { balanceOf, fmtMoney, monthKey, type Customer, type Store } from "@/lib/store";
import { MessageCircle, Search, Send } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";

const waLink = (num: string, text: string) => {
  const clean = num.replace(/\D/g, "").replace(/^0/, "92");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
};

// A plain WebView's window.open(url, "_blank") does not hand a https://wa.me
// link off to the installed WhatsApp app the way a real browser tab does --
// confirmed in the pre-Phase-9 audit. @capacitor/browser's Browser.open()
// uses Chrome Custom Tabs on Android, which DOES respect Android's app-link
// handling, so it opens WhatsApp itself exactly like tapping the link in a
// normal browser would. Web/desktop (Capacitor.isNativePlatform() === false)
// keeps the exact same window.open(...) call as before -- unchanged.
const openExternalUrl = async (url: string) => {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
  } else {
    window.open(url, "_blank");
  }
};

export function MessagesScreen({ store }: { store: Store }) {
  const mk = monthKey();
  const monthName = new Date().toLocaleString("en-GB", { month: "long" });
  const [custom, setCustom] = React.useState("");
  const [manualNumber, setManualNumber] = React.useState("");
  const [query, setQuery] = React.useState("");

  const unpaid = store.data.customers.filter((c) => !c.paidMonths.includes(mk));
  const paid = store.data.customers.filter((c) => c.paidMonths.includes(mk));

  const q = query.trim().toLowerCase();
  const filteredCustomers = store.data.customers.filter((c) => c.name.toLowerCase().includes(q));

  const unpaidMsg = (c: Customer) =>
    custom.trim()
      ? custom
      : `Assalam o Alaikum ${c.name}, your medical bill at Zeeshan Medical Store for ${monthName} is ${fmtMoney(balanceOf(c))}. Kindly clear your payment. Shukriya.`;

  const paidMsg = (c: Customer) =>
    custom.trim()
      ? custom
      : `Assalam o Alaikum ${c.name}, your monthly bill at Zeeshan Medical Store is paid. Thank you!`;

  const send = (num: string, text: string, who: string) => {
    if (!num) return;
    void openExternalUrl(waLink(num, text));
    store.log(`Sent WhatsApp message to ${who}`);
  };

  const sendAll = (list: Customer[], msg: (c: Customer) => string) => {
    list.forEach((c, i) => {
      if (!c.contact) return;
      setTimeout(() => send(c.contact, msg(c), c.name), i * 400);
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-base font-bold text-foreground">Custom message (optional)</h2>
        <Textarea
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Leave empty to use the automatic bill message"
          className="mt-3"
        />
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            value={manualNumber}
            onChange={(e) => setManualNumber(e.target.value)}
            placeholder="Send to a number e.g. 0300-000000-0"
          />
          <Button
            className="shrink-0"
            onClick={() =>
              send(
                manualNumber,
                custom.trim() || "Message from Zeeshan Medical Store",
                manualNumber,
              )
            }
          >
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="success"
          className="h-12"
          onClick={() => sendAll(unpaid, unpaidMsg)}
          disabled={unpaid.length === 0}
        >
          <MessageCircle className="h-4 w-4" /> Message all unpaid ({unpaid.length})
        </Button>
        <Button
          variant="outline"
          className="h-12"
          onClick={() => sendAll(paid, paidMsg)}
          disabled={paid.length === 0}
        >
          <MessageCircle className="h-4 w-4" /> Message all paid ({paid.length})
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          className="pl-9"
        />
      </div>

      {store.data.customers.length > 0 && filteredCustomers.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No matches.</p>
      )}

      <div className="space-y-2">
        {filteredCustomers.map((c) => {
          const isPaid = c.paidMonths.includes(mk);
          return (
            <div
              key={c.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">{c.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {c.contact || "no contact"} ·{" "}
                  <span className={isPaid ? "text-success" : "text-destructive"}>
                    {isPaid ? "paid" : "unpaid"}
                  </span>
                </p>
              </div>
              <Button
                size="sm"
                variant={isPaid ? "outline" : "success"}
                className="shrink-0"
                disabled={!c.contact}
                onClick={() => send(c.contact, isPaid ? paidMsg(c) : unpaidMsg(c), c.name)}
              >
                <Send className="h-4 w-4" /> WhatsApp
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
