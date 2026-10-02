import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDateTime, fmtMoney } from "@/lib/store";
import { useNotes } from "@/lib/notes";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export function NotesScreen({ onBack }: { onBack: () => void }) {
  const { notes, ready, addNote, removeNote } = useNotes();
  const [text, setText] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [err, setErr] = React.useState("");

  const total = notes.reduce((s, n) => s + n.amount, 0);

  const add = () => {
    const t = text.trim();
    if (!t) {
      setErr("Write a note first");
      return;
    }
    const a = amount.trim() === "" ? 0 : Number(amount);
    if (!Number.isFinite(a) || a < 0) {
      setErr("Enter a valid amount");
      return;
    }
    addNote(t, a);
    setText("");
    setAmount("");
    setErr("");
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" className="-ml-2 h-9" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-base font-bold text-foreground">Additional notes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Personal notes with an amount. These are NOT counted in the shop's credit, recovery,
          reports or backup.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">Notes total</p>
        <p className="text-2xl font-black text-foreground">{fmtMoney(total)}</p>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErr("");
          }}
          placeholder="Note, e.g. Borrowed for rent"
        />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErr("");
            }}
            placeholder="Amount (optional)"
          />
          <Button onClick={add}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>

      {ready && notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No notes yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">{n.text}</p>
                <p className="text-[11px] text-muted-foreground">{fmtDateTime(n.date)}</p>
              </div>
              <p className="text-sm font-black text-foreground">{fmtMoney(n.amount)}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete note"
                onClick={() => {
                  if (window.confirm("Delete this note?")) removeNote(n.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
