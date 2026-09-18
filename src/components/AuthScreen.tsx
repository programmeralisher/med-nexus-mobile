import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Stethoscope } from "lucide-react";
import {
  SECURITY_QUESTIONS,
  signInAccount,
  signUpAccount,
  AuthError,
} from "@/lib/authAccount";

// TODO(production, contact number): put the real developer support number
// here before shipping -- placeholder only.
const DEVELOPER_SUPPORT_NUMBER = "0300-000000-0";

type Mode = "signin" | "signup" | "forgot";

export function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = React.useState<Mode>("signin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-secondary to-background px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Stethoscope className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-center text-2xl font-black leading-tight text-foreground sm:text-3xl">
          Credit Ledger App
        </h1>

        {mode === "signin" && (
          <SignInForm onSuccess={onSuccess} onForgot={() => setMode("forgot")} onSignUp={() => setMode("signup")} />
        )}
        {mode === "signup" && (
          <SignUpForm onSuccess={onSuccess} onBack={() => setMode("signin")} />
        )}
        {mode === "forgot" && <ForgotPassword onBack={() => setMode("signin")} />}
      </div>
    </main>
  );
}

function SignInForm({
  onSuccess,
  onForgot,
  onSignUp,
}: {
  onSuccess: () => void;
  onForgot: () => void;
  onSignUp: () => void;
}) {
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInAccount({ phone, password });
      onSuccess();
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="mt-2 text-center text-sm text-muted-foreground">Sign in to your shop account</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <Input
          type="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number e.g. 0300-000000-0"
          className="h-12 text-base"
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="h-12 text-base"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full text-base font-semibold">
          {busy ? "Signing in..." : "Sign in"}
        </Button>
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button type="button" onClick={onForgot} className="text-primary underline underline-offset-2">
          Forgot password?
        </button>
        <button type="button" onClick={onSignUp} className="text-primary underline underline-offset-2">
          Create account
        </button>
      </div>
    </>
  );
}

function SignUpForm({ onSuccess, onBack }: { onSuccess: () => void; onBack: () => void }) {
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [shopName, setShopNameField] = React.useState("");
  const [securityQuestion, setSecurityQuestion] = React.useState<string>(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signUpAccount({
        phone,
        password,
        confirmPassword,
        shopName,
        securityQuestion,
        securityAnswer,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="mt-2 text-center text-sm text-muted-foreground">Create your shop's account</p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <Input
          type="text"
          autoFocus
          value={shopName}
          onChange={(e) => setShopNameField(e.target.value)}
          placeholder="Your shop name (shown on app & PDFs)"
          className="h-12 text-base"
        />
        <Input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number e.g. 0300-000000-0"
          className="h-12 text-base"
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Choose a password (min. 6 characters)"
          className="h-12 text-base"
        />
        <Input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          className="h-12 text-base"
        />
        <select
          value={securityQuestion}
          onChange={(e) => setSecurityQuestion(e.target.value)}
          className="h-12 w-full rounded-md border border-input bg-background px-3 text-base"
        >
          {SECURITY_QUESTIONS.map((q) => (
            <option key={q} value={q}>
              {q}
            </option>
          ))}
        </select>
        <Input
          type="text"
          value={securityAnswer}
          onChange={(e) => setSecurityAnswer(e.target.value)}
          placeholder="Your answer"
          className="h-12 text-base"
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full text-base font-semibold">
          {busy ? "Creating account..." : "Create account"}
        </Button>
      </form>
      <div className="mt-4 text-center text-sm">
        <button type="button" onClick={onBack} className="text-primary underline underline-offset-2">
          Already have an account? Sign in
        </button>
      </div>
    </>
  );
}

function ForgotPassword({ onBack }: { onBack: () => void }) {
  return (
    <>
      <p className="mt-2 text-center text-sm text-muted-foreground">Forgot your password?</p>
      <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
        Please contact the developer for help resetting your password:
        <div className="mt-2 text-base font-semibold text-foreground">{DEVELOPER_SUPPORT_NUMBER}</div>
      </div>
      <div className="mt-4 text-center text-sm">
        <button type="button" onClick={onBack} className="text-primary underline underline-offset-2">
          Back to sign in
        </button>
      </div>
    </>
  );
}
