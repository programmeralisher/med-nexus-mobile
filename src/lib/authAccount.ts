/**
 * Real per-account authentication (production/SaaS branch).
 *
 * Replaces the old single shared STORE_PASSWORD gate with a proper account:
 * phone number + user-chosen password, plus a security question used later
 * for account recovery / linking a second device to the same shop.
 *
 * Firebase Auth's built-in providers are email/password, not
 * phone+password (phone auth in Firebase means SMS OTP, which needs a
 * paid plan and is explicitly out of scope for this patch per the plan --
 * OTP is a later addition). So we deterministically turn the phone number
 * into a fake, never-emailed-to address and use that as the Auth "email".
 * The user only ever sees/enters their phone number.
 *
 * NOT YET WIRED IN THIS PATCH (deliberately, per the discussed roadmap):
 *  - Self-service password reset via the security question (the Forgot
 *    Password screen currently just tells the user to contact the
 *    developer, as asked). The security answer is captured and stored now
 *    so that flow can be built on top of it later without another
 *    migration.
 *  - Multi-device linking / shared tenant data between two accounts of the
 *    same shop, and the per-device block/unblock admin panel. Those need
 *    the full `/tenants/{id}` Firestore data model + rules rewrite, which
 *    is a separate, larger patch.
 *  - Firestore security rules matching this new accounts collection are
 *    NOT included in this patch -- update firestore.rules before relying on
 *    this in production, or Firestore will reject these reads/writes.
 */
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFirebase } from "./firebase";
import { setShopName, clearShopName } from "./shop";

const EMAIL_DOMAIN = "medapp.internal";

export const SECURITY_QUESTIONS = [
  "What is your father's name?",
  "What city were you born in?",
  "What was the name of your first shop or job?",
  "What is your mother's first name?",
] as const;

export class AuthError extends Error {}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) {
    throw new AuthError("Enter a valid phone number.");
  }
  return digits;
}

function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@${EMAIL_DOMAIN}`;
}

function validatePassword(password: string, phone: string): void {
  if (password.length < 6) {
    throw new AuthError("Password must be at least 6 characters.");
  }
  if (password === normalizePhone(phone)) {
    throw new AuthError("Password can't be the same as your phone number.");
  }
}

async function hashAnswer(answer: string): Promise<string> {
  const normalized = answer.trim().toLowerCase();
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface SignUpInput {
  phone: string;
  password: string;
  confirmPassword: string;
  shopName: string;
  securityQuestion: string;
  securityAnswer: string;
}

export async function signUpAccount(input: SignUpInput): Promise<User> {
  const services = getFirebase();
  if (!services) throw new AuthError("App is offline and this device has no saved account yet.");

  const { phone, password, confirmPassword, shopName, securityQuestion, securityAnswer } = input;

  if (password !== confirmPassword) throw new AuthError("Passwords don't match.");
  validatePassword(password, phone);
  if (!shopName.trim()) throw new AuthError("Enter your shop name.");
  if (!securityAnswer.trim()) throw new AuthError("Enter an answer to your security question.");

  const email = phoneToEmail(phone);
  const { auth, db } = services;

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    if (err?.code === "auth/email-already-in-use") {
      throw new AuthError("An account with this phone number already exists.");
    }
    throw new AuthError(err?.message ?? "Could not create account.");
  }

  // NOTE: requires matching Firestore rules for the `accounts` collection --
  // see the file header. Until those rules are written, this write will be
  // rejected by Firestore (account creation in Firebase Auth will still
  // succeed even if this fails).
  await setDoc(doc(db, "accounts", cred.user.uid), {
    phone: normalizePhone(phone),
    shopName: shopName.trim(),
    securityQuestion,
    securityAnswerHash: await hashAnswer(securityAnswer),
    createdAt: serverTimestamp(),
  });

  setShopName(shopName);
  return cred.user;
}

export interface SignInInput {
  phone: string;
  password: string;
}

export async function signInAccount(input: SignInInput): Promise<User> {
  const services = getFirebase();
  if (!services) throw new AuthError("No internet connection and no saved session on this device.");

  const email = phoneToEmail(input.phone);
  try {
    const cred = await signInWithEmailAndPassword(services.auth, email, input.password);
    return cred.user;
  } catch (err: any) {
    if (err?.code === "auth/invalid-credential" || err?.code === "auth/wrong-password" || err?.code === "auth/user-not-found") {
      throw new AuthError("Incorrect phone number or password.");
    }
    throw new AuthError(err?.message ?? "Could not sign in.");
  }
}

/**
 * Step-up re-authentication: re-checks the CURRENT signed-in user's real
 * password against Firebase Auth. Replaces the old STORE_PASSWORD == pwd
 * comparison in StepUpPasswordDialog.tsx / SettingsScreen.tsx now that
 * there's no single shared app password to check against -- each account
 * has its own.
 */
export async function verifyCurrentPassword(password: string): Promise<boolean> {
  const services = getFirebase();
  const user = services?.auth.currentUser;
  if (!services || !user || !user.email) return false;

  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return true;
  } catch {
    return false;
  }
}

export async function signOutAccount(): Promise<void> {
  const services = getFirebase();
  if (!services) return;
  await firebaseSignOut(services.auth);
  clearShopName();
}

/** Subscribes to real Firebase Auth session state (persists across reopens/refreshes on its own). */
export function watchAuthState(callback: (user: User | null) => void): () => void {
  const services = getFirebase();
  if (!services) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(services.auth, callback);
}
