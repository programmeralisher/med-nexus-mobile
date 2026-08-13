import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { balanceOf, fmtMoney, monthKey, type Customer, type Store } from "@/lib/store";
import { MessageCircle, Send } from "lucide-react";

const waLink = (num: string, text: string) => {
  const clean = num.replace(/\D/g, "").replace(/^0/, "92");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
};

export function MessagesScreen({ store }: { store: Store }) {
  const mk = monthKey();
  const monthName = new Date().toLocaleString("en-GB", { month: "long" });
  const [custom, setCustom] = React.useState("");
  const [manualNumber, setManualNumber] = React.useState("");

  const unpaid = store.data.customers.filter((c) => !c.paidMonths.includes(mk));
  const paid = store.data.customers.filter((c) => c.paidMonths.includes(mk));

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
    window.open(waLink(num, text), "_blank");
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
            placeholder="Send to a number e.g. 03233745904"
          />
          <Button
            className="shrink-0"
            onClick={() =>
              send(manualNumber, custom.trim() || "Message from Zeeshan Medical Store", manualNumber)
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

      <div className="space-y-2">
        {store.data.customers.map((c) => {
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
