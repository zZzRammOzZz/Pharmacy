function apiRoot() {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api").replace(/\/$/, "");
  return raw.endsWith("/api") ? raw : `${raw}/api`;
}

export const API_URL = apiRoot();

export type Session = {
  accessToken: string;
  licenseToken: string;
  user: { name: string; email: string; role: string; permissions?: string[]; tenant: { name: string; code: string } };
  license: { plan: string; seats: number; features: string[]; expiresAt: string };
  branchId?: string;
  branches?: { id: string; name: string }[];
};

export function loadSession(): Session | null {
  const raw = localStorage.getItem("pharmacyos_counter");
  return raw ? (JSON.parse(raw) as Session) : null;
}

export function encodeLicenseToken(file: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(file));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export async function api<T>(path: string, session: Session, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  headers.set("x-license-token", session.licenseToken);
  if (session.branchId) headers.set("x-branch-id", session.branchId);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(message || "Request failed");
  }
  return body as T;
}

export function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function lira(amount: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
}

export function liraOf(cents: number, rate: number) {
  return Math.round((cents / 100) * rate);
}

export function allowed(session: Session, permission: string) {
  if (session.user.role === "owner") return true;
  return (session.user.permissions || []).includes(permission);
}

export function paymentLabel(method?: string | null) {
  if (method === "cash_ll") return "Cash LL";
  if (method === "card") return "Card";
  if (method === "credit") return "On account";
  return "Cash USD";
}

export function when(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

export function clock(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
