import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STORE_PASSWORD } from "@/lib/store";
import { Stethoscope } from "lucide-react";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [pwd, setPwd] = React.useState("");
  const [error, setError] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd === STORE_PASSWORD) onSuccess();
    else setError("Incorrect password. Try again.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary to-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Stethoscope className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-center text-2xl font-black leading-tight text-foreground sm:text-3xl">
          Zeeshan medical store khatta app
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Enter password to sign in
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input
            type="password"
            autoFocus
            value={pwd}
            onChange={(e) => {
              setPwd(e.target.value);
              setError("");
            }}
            placeholder="Password"
            className="h-12 text-base"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="h-12 w-full text-base font-semibold">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
