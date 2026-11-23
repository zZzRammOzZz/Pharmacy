export const CAPABILITIES = [
  { id: "register", label: "Register" },
  { id: "refund", label: "Refund and replace" },
  { id: "shift", label: "Shift" },
  { id: "mainReading", label: "Whole till" },
  { id: "purchases", label: "Goods in" },
  { id: "stock", label: "Catalog, counts, and waste" },
  { id: "corrections", label: "Correct a delivery or write-off" },
  { id: "clients", label: "Clients" },
  { id: "clientAged", label: "Client aged" },
  { id: "prescriptions", label: "Prescriptions" },
  { id: "suppliers", label: "Suppliers" },
  { id: "wholesalers", label: "Wholesaler aged" },
  { id: "orders", label: "To order" },
  { id: "reports", label: "Reports" },
] as const;

export const STAFF_ROLES = [
  { id: "cashier", label: "Cashier" },
  { id: "pharmacist", label: "Pharmacist" },
  { id: "manager", label: "Manager" },
  { id: "cost", label: "Cost controller" },
] as const;

export type Capability = (typeof CAPABILITIES)[number]["id"];
export type StaffRole = (typeof STAFF_ROLES)[number]["id"];

export const CAPABILITY_IDS = CAPABILITIES.map((item) => item.id) as [Capability, ...Capability[]];
export const ROLE_ID = /^[a-z][a-z0-9]{1,31}$/;

const BUILTIN = new Set<string>(STAFF_ROLES.map((role) => role.id));

export const ROLE_DEFAULTS: Record<StaffRole, Capability[]> = {
  cashier: ["register"],
  pharmacist: ["register", "refund", "shift", "purchases", "stock", "clients", "prescriptions"],
  manager: ["register", "refund", "shift", "mainReading", "purchases", "stock", "corrections", "clients", "clientAged", "prescriptions", "suppliers", "wholesalers", "orders", "reports"],
  cost: ["purchases"],
};

export type RoleRecord = {
  id: string;
  label: string;
  access: Capability[];
  enabled: boolean;
  custom: boolean;
};

function caps(value: unknown): Capability[] {
  const source = Array.isArray(value) ? value : [];
  return CAPABILITY_IDS.filter((id) => source.includes(id));
}

function readEntry(value: unknown, fallback: Capability[]) {
  if (Array.isArray(value)) return { access: caps(value), enabled: true, label: "", custom: false };
  if (value && typeof value === "object") {
    const entry = value as Record<string, unknown>;
    return {
      access: Array.isArray(entry.access) ? caps(entry.access) : fallback,
      enabled: entry.enabled !== false,
      label: typeof entry.label === "string" ? entry.label.trim() : "",
      custom: entry.custom === true,
    };
  }
  return { access: fallback, enabled: true, label: "", custom: false };
}

function savedMap(raw?: string | null) {
  if (!raw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

export function roleCatalog(raw?: string | null): RoleRecord[] {
  const saved = savedMap(raw);
  const builtin = STAFF_ROLES.map((role) => {
    const entry = readEntry(saved[role.id], ROLE_DEFAULTS[role.id]);
    return { id: role.id, label: role.label, access: entry.access, enabled: entry.enabled, custom: false };
  });
  const custom = Object.keys(saved)
    .filter((id) => !BUILTIN.has(id) && ROLE_ID.test(id))
    .map((id) => {
      const entry = readEntry(saved[id], []);
      return { id, label: entry.label || id, access: entry.access, enabled: entry.enabled, custom: true };
    });
  return [...builtin, ...custom];
}

export function accessFor(role: string, raw?: string | null): Capability[] {
  if (role === "owner") return [...CAPABILITY_IDS];
  const found = roleCatalog(raw).find((item) => item.id === role);
  if (!found || !found.enabled) return [];
  return found.access;
}

export function allows(user: { role: string; permissions: string[] }, capability: string) {
  return user.role === "owner" || user.permissions.includes(capability);
}

export function storeRoles(roles: RoleRecord[]) {
  const stored: Record<string, { label: string; access: Capability[]; enabled: boolean; custom: boolean }> = {};
  for (const role of roles) stored[role.id] = { label: role.label, access: role.access, enabled: role.enabled, custom: role.custom };
  return JSON.stringify(stored);
}
