export type ExpiryStatus = "expired" | "critical" | "soon" | "ok" | "none";

export type Batch = {
  id: string;
  batchNumber: string;
  serialNumber: string | null;
  quantity: number;
  expiryDate: string;
  costCents: number;
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
  method: string;
  amountCents: number;
  llAmount: number | null;
  note: string | null;
  createdAt: string;
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
  purchases: {
    id: string;
    reference: string;
    createdAt: string;
    notes: string | null;
    lines: { id: string; quantity: number; batchNumber: string; expiryDate: string; medicine: { name: string } }[];
  }[];
};

export type Bootstrap = {
  medicines: Medicine[];
  lowStock: Medicine[];
  expired: (Batch & { medicine: string })[];
  expiring: (Batch & { medicine: string })[];
  patientCount: number;
  pendingPrescriptions: number;
  llPerUsd: number;
  salesToday: { count: number; totalCents: number };
};

export type Section = "today" | "register" | "stock" | "patients" | "prescriptions" | "suppliers";
