export type ExpiryStatus = "expired" | "critical" | "soon" | "ok" | "none";

export type Batch = {
  id: string;
  batchNumber: string;
  serialNumber: string | null;
  quantity: number;
  expiryDate: string;
  costCents: number;
  receivedAt?: string;
  expiryStatus: ExpiryStatus;
  daysToExpiry: number;
};

export type Medicine = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  medicineType: string;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  unitPriceCents: number;
  reorderLevel: number;
  onHand: number;
  inDate: number;
  nearestExpiry: string | null;
  expiryStatus: ExpiryStatus;
  batches: Batch[];
};

export type Patient = {
  id: string;
  name: string;
  phone: string | null;
  sex: string | null;
  dateOfBirth: string | null;
  nationalId: string | null;
  address: string | null;
  allergies: string | null;
  notes: string | null;
  createdAt: string;
};

export type AccountPayment = {
  id: string;
  receiptNo: string | null;
  method: string;
  amountCents: number;
  llAmount: number | null;
  note: string | null;
  createdAt: string;
};

export type ClosingReceipt = {
  receiptNo: string | null;
  method: string;
  amountCents: number;
  llPerUsd: number | null;
  llAmount: number | null;
  note: string | null;
  createdAt: string;
  patient: { name: string };
  lines: { receiptNo: string; createdAt: string; amountCents: number }[];
  balanceCents: number;
};

export type AgedClient = {
  id: string;
  name: string;
  phone: string | null;
  currentCents: number;
  days31Cents: number;
  days61Cents: number;
  days91Cents: number;
  totalCents: number;
  open: { saleId: string; receiptNo: string; createdAt: string; openCents: number; ageDays: number }[];
};

export type ClientProfile = Patient & {
  saleCount: number;
  spentCents: number;
  owedCents: number;
  sales: Sale[];
  payments: AccountPayment[];
  prescriptions: { id: string; status: string; doctorName: string | null; createdAt: string; items: { quantity: number; medicine: { name: string } }[] }[];
};

export type Prescription = {
  id: string;
  status: string;
  doctorName: string | null;
  notes: string | null;
  createdAt: string;
  patient: { id: string; name: string; allergies: string | null };
  items: { quantity: number; dosage: string | null; medicine: { id: string; name: string; strength: string | null } }[];
};

export type Sale = {
  id: string;
  receiptNo: string;
  totalCents: number;
  paymentMethod?: string;
  llPerUsd?: number | null;
  llAmount?: number | null;
  createdAt: string;
  patient: { name: string } | null;
  items: { id: string; quantity: number; lineCents: number; unitPriceCents: number; origin?: string; medicine: { id: string; name: string; strength: string | null } }[];
  events: {
    id: string;
    kind: string;
    note: string | null;
    amountCents: number;
    createdAt: string;
    lines: {
      saleItemId: string | null;
      direction: string;
      quantity: number;
      medicine: { name: string; strength: string | null };
    }[];
  }[];
};

export type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  paymentTerms: string | null;
  notes: string | null;
  createdAt: string;
};

export type SupplierProfile = Supplier & {
  purchaseCount: number;
  owedCents: number;
  purchases: {
    id: string;
    reference: string;
    createdAt: string;
    notes: string | null;
    lines: { id: string; quantity: number; costCents: number; batchNumber: string; expiryDate: string; medicine: { name: string } }[];
  }[];
};

export type AgedSupplier = {
  id: string;
  name: string;
  phone: string | null;
  currentCents: number;
  days31Cents: number;
  days61Cents: number;
  days91Cents: number;
  totalCents: number;
  open: { purchaseId: string; reference: string; createdAt: string; openCents: number; ageDays: number }[];
};

export type WholesalerClosing = {
  receiptNo: string | null;
  method: string;
  amountCents: number;
  llPerUsd: number | null;
  llAmount: number | null;
  note: string | null;
  createdAt: string;
  supplier: { name: string };
  lines: { reference: string; createdAt: string; amountCents: number }[];
  balanceCents: number;
};

export type Bootstrap = {
  medicines: Medicine[];
  lowStock: Medicine[];
  expired: (Batch & { medicine: string })[];
  expiring: (Batch & { medicine: string })[];
  patientCount: number;
  pendingPrescriptions: number;
  llPerUsd: number;
  agedCount: number;
  supplierAgedCount: number;
  orderCount: number;
  branches: { id: string; name: string }[];
  me: { role: string; permissions: string[]; features?: string[]; plan?: string; seats?: number };
  salesToday: { count: number; totalCents: number };
};

export type StaffList = {
  seats: number;
  used: number;
  staff: { id: string; name: string; email: string; role: string; permissions: string[]; branch?: { id: string; name: string } | null; createdAt: string }[];
};

export type ReadingRow = {
  id: string;
  name: string;
  role: string;
  branch?: string | null;
  receipts: number;
  takingsCents: number;
};

export type Reading = {
  scope?: "all" | "branch";
  mine: ReadingRow;
  main: {
    receipts: number;
    takingsCents: number;
    staff: ReadingRow[];
    lines: { at: string; kind: string; who: string; label: string; amountCents: number; method: string | null }[];
  } | null;
};

export type ReportRange = "today" | "month" | "custom";

export type Report = {
  range: ReportRange;
  from: string;
  to: string;
  soldCents: number;
  collectedCents: number;
  costCents: number;
  profitCents: number;
  margin: number;
  receipts: number;
  refundCents: number;
  expiredWasteCents: number;
  otherWasteCents: number;
  expiredOnShelfCents: number;
  openCreditCents: number;
  byDay: { date: string; soldCents: number; collectedCents: number; costCents: number; profitCents: number; receipts: number }[];
  byProduct: { id: string; name: string; quantity: number; soldCents: number; costCents: number; profitCents: number }[];
  byStaff: { id: string; name: string; role: string; receipts: number; soldCents: number; collectedCents: number }[];
  byMethod: { method: string; receipts: number; cents: number }[];
  highlights: string[];
};

export type OrderLine = {
  medicineId: string;
  name: string;
  strength: string | null;
  inDate: number;
  reorderLevel: number;
  sold: number;
  daysCover: number | null;
  orderQty: number;
  costCents: number;
  lineCents: number;
  reason: "reorder" | "fast" | "both";
};

export type OrderList = {
  windowDays: number;
  count: number;
  totalCents: number;
  groups: { supplierId: string | null; supplierName: string; totalCents: number; lines: OrderLine[] }[];
};

export type EmployeeLogReport = {
  range: ReportRange;
  from: string;
  to: string;
  staff: { id: string; name: string; role: string }[];
  signIns: number;
  signOuts: number;
  sales: number;
  refunds: number;
  entries: { at: string; action: string; summary: string; staffId: string | null; name: string; role: string; branch: string | null }[];
};

export type Section = "today" | "register" | "stock" | "patients" | "aged" | "prescriptions" | "suppliers" | "wholesalers" | "orders" | "reports" | "employeeLog" | "staff";
