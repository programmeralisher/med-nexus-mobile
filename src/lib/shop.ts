/**
 * Shop identity (production/SaaS branch).
 *
 * Replaces the old hardcoded "Zeeshan Medical Store" branding. Each account
 * chooses its own shop name at signup (see AuthScreen.tsx); that name is
 * cached locally so the UI, PDF exports, and WhatsApp message templates can
 * render synchronously (and offline) without waiting on a Firestore read on
 * every screen.
 *
 * NOTE: this is intentionally a single flat localStorage cache for now, not
 * yet wired into a full `/tenants/{id}` Firestore document -- that
 * multi-tenant data model (device lists, blocking, admin panel, etc.) is a
 * separate, larger patch we're doing next. For this patch, the goal is just:
 * no hardcoded shop name anywhere, and the signup flow captures the real
 * one.
 */

const SHOP_NAME_KEY = "medapp-shop-name";
const DEFAULT_SHOP_NAME = "My Medical Store";

export function getShopName(): string {
  if (typeof window === "undefined") return DEFAULT_SHOP_NAME;
  return window.localStorage.getItem(SHOP_NAME_KEY) || DEFAULT_SHOP_NAME;
}

export function setShopName(name: string): void {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (trimmed) window.localStorage.setItem(SHOP_NAME_KEY, trimmed);
}

export function clearShopName(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SHOP_NAME_KEY);
}
