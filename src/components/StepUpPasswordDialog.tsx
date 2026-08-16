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
import { STORE_PASSWORD } from "@/lib/store";

/**
 * Re-enter-the-shop-password confirmation, used for sensitive actions that
 * must always re-prompt regardless of whether the device is already logged
 * in -- per the brief's step-up-password requirement for edit-customer-info
 * and delete-transaction (§6a), applied here for consistency with the
 * existing delete-customer flow.
 *
 * The EXISTING delete-customer dialog in SettingsScreen.tsx has its own
 * bespoke implementation (it also embeds a customer-picker list in the same
 * dialog, so it doesn't cleanly decompose into just a password prompt) and
 * is deliberately left untouched, per "preserve every existing screen
 * exactly as-is." This component is used only for the two new/newly-gated
 * actions below, where there's no pre-existing UI to risk changing.
 *
 * The password field always resets to empty when the dialog opens, so it
 * genuinely re-prompts every time -- never remembers a previous entry.
 */
export function StepUpPasswordDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const [pwd, setPwd] = React.useState("");
  const [err, setErr] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setPwd("");
      setErr("");
    }
  }, [open]);

  const confirm = () => {
    if (pwd !== STORE_PASSWORD) {
      setErr("Wrong password");
      return;
    }
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        <Input
          autoFocus
          type="password"
          placeholder="Enter shop password"
          value={pwd}
          onChange={(e) => {
            setPwd(e.target.value);
            setErr("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
          }}
        />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <DialogFooter>
          <Button
            variant={destructive ? "destructive" : "default"}
            className="w-full"
            onClick={confirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
