"use client";

import { FormEvent, Fragment, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { allowed, api, money, Session, when } from "@/lib/api";
import { Batch, Medicine, Supplier } from "@/lib/types";
import { Dialog, Field, Notice, Panel, PrimaryButton, control, newButton, quietSubmit } from "./ui";

const types = [
  ["tablet", "Tablet"],
  ["capsule", "Capsule"],
  ["syrup", "Syrup"],
  ["suspension", "Suspension"],
  ["injection", "Injection"],
  ["cream", "Cream"],
  ["drops", "Drops"],
  ["inhaler", "Inhaler"],
  ["device", "Device"],
  ["other", "Other"],
] as const;

const wasteReasons = [
  ["expired", "Expired"],
  ["damaged", "Damaged"],
  ["broken", "Broken"],
  ["recalled", "Recalled"],
  ["contaminated", "Contaminated"],
  ["spilled", "Spilled"],
] as const;

const adjustReasons = [
  ["count", "Stock count"],
  ["found", "Found on the shelf"],
  ["correction", "Data correction"],
  ["return", "Returned to the shelf"],
  ["expiry", "Expiry correction"],
] as const;

type Tab = "catalog" | "purchases" | "adjust" | "waste";
type ShelfBatch = Batch & { medicine: Medicine };

type Purchase = {
  id: string;
  reference: string;
  notes: string | null;
  createdAt: string;
  supplier: { id: string; name: string } | null;
  payments: { amountCents: number }[];
  lines: {
    id: string;
    quantity: number;
    costCents: number;
    batchNumber: string;
    serialNumber: string | null;
    expiryDate: string;
    medicine: { id: string; name: string };
    batch: { quantity: number } | null;
  }[];
};

type LineEdit = {
  id: string;
  medicineId: string;
  name: string;
  quantity: string;
  cost: string;
  expiry: string;
  batchNumber: string;
  serialNumber: string;
  onHand: number;
  received: number;
};

type Movement = {
  id: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  expiryFrom: string | null;
  expiryTo: string | null;
  createdAt: string;
  medicine: { name: string };
  batch: { id: string; batchNumber: string; quantity: number };
};

type DraftLine = {
  medicineId: string;
  name: string;
  batchNumber: string;
  serialNumber: string;
  quantity: number;
  expiryDate: string;
  costCents: number;
};

export function Stock({ session }: { session: Session }) {
  const [tab, setTab] = useState<Tab>("catalog");
  const [rows, setRows] = useState<Medicine[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [adjustments, setAdjustments] = useState<Movement[]>([]);
  const [waste, setWaste] = useState<Movement[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "expired" | "soon" | "reorder">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [lineMedicine, setLineMedicine] = useState<Medicine | null>(null);
  const [lineBatch, setLineBatch] = useState("");
  const [lineSerial, setLineSerial] = useState("");
  const [lineQty, setLineQty] = useState("");
  const [lineCost, setLineCost] = useState("");
  const [lineExpiry, setLineExpiry] = useState("");
  const [creating, setCreating] = useState(false);
  const [addingMedicine, setAddingMedicine] = useState(false);
  const [createSeed, setCreateSeed] = useState({ name: "", barcode: "" });
  const [invoiceRef, setInvoiceRef] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [lineFocus, setLineFocus] = useState(0);
  const [batchQuery, setBatchQuery] = useState("");
  const [adjustBatch, setAdjustBatch] = useState<ShelfBatch | null>(null);
  const [counted, setCounted] = useState("");
  const [adjustExpiry, setAdjustExpiry] = useState("");
  const [adjustReason, setAdjustReason] = useState("count");
  const [adjustNote, setAdjustNote] = useState("");
  const [wasteScope, setWasteScope] = useState<"expired" | "all">("expired");
  const [editingPurchase, setEditingPurchase] = useState<string | null>(null);
  const [editSupplier, setEditSupplier] = useState("");
  const [editRef, setEditRef] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editLines, setEditLines] = useState<LineEdit[]>([]);
  const [wasteId, setWasteId] = useState<string | null>(null);
  const [wasteQty, setWasteQty] = useState("");
  const [wasteReason, setWasteReason] = useState("damaged");
  const [wasteNote, setWasteNote] = useState("");
  const [wastePackId, setWastePackId] = useState("");
  const [wasteQuery, setWasteQuery] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const canEdit = allowed(session, "stock");
  const canPurchase = allowed(session, "purchases");
  const canCorrect = allowed(session, "corrections");

  async function load() {
    const [medicines, purchaseRows, adjustmentRows, wasteRows] = await Promise.all([
      api<Medicine[]>("/pharmacy/medicines", session),
      canPurchase || canCorrect ? api<Purchase[]>("/pharmacy/purchases", session) : Promise.resolve([]),
      canEdit || canCorrect ? api<Movement[]>("/pharmacy/movements?kind=adjustment", session) : Promise.resolve([]),
      canEdit || canCorrect ? api<Movement[]>("/pharmacy/movements?kind=waste", session) : Promise.resolve([]),
    ]);
    setRows(medicines);
    setPurchases(purchaseRows);
    setAdjustments(adjustmentRows);
    setWaste(wasteRows);
    try {
      setSuppliers(await api<Supplier[]>("/pharmacy/suppliers", session));
    } catch {
      setSuppliers([]);
    }
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, [session.branchId]);

  useEffect(() => {
    const open = [
      ...(canEdit ? ["catalog" as const] : []),
      ...(canPurchase || canCorrect ? ["purchases" as const] : []),
      ...(canEdit ? ["adjust" as const, "waste" as const] : []),
    ];
    if (!open.includes(tab) && open[0]) setTab(open[0]);
  }, [canEdit, canPurchase, canCorrect, tab]);

  const shelf = useMemo(() => {
    const batches: ShelfBatch[] = [];
    for (const medicine of rows) {
      for (const batch of medicine.batches) {
        if (batch.quantity > 0) batches.push({ ...batch, medicine });
      }
    }
    return batches.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  }, [rows]);

  const expiredPacks = shelf.filter((batch) => batch.expiryStatus === "expired").reduce((sum, batch) => sum + batch.quantity, 0);
  const inDatePacks = rows.reduce((sum, medicine) => sum + medicine.inDate, 0);
  const reorderCount = rows.filter((medicine) => medicine.inDate <= medicine.reorderLevel).length;
  const shelfValue = shelf
    .filter((batch) => batch.expiryStatus !== "expired")
    .reduce((sum, batch) => sum + batch.quantity * batch.costCents, 0);
  const invoiceTotal = draft.reduce((sum, line) => sum + line.quantity * line.costCents, 0);
  const expiryPast = Boolean(lineExpiry) && new Date(`${lineExpiry}T00:00:00`).getTime() < new Date(new Date().toDateString()).getTime();
  const filledFromLast = lineMedicine ? previousLine(lineMedicine, purchases) : null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((medicine) => {
      const serials = medicine.batches.map((batch) => batch.serialNumber || "").join(" ");
      const matches = !needle || `${medicine.name} ${medicine.sku} ${medicine.barcode || ""} ${medicine.genericName || ""} ${medicine.strength || ""} ${serials}`.toLowerCase().includes(needle);
      const expired = medicine.batches.some((batch) => batch.quantity > 0 && batch.expiryStatus === "expired");
      const soon = medicine.expiryStatus === "critical" || medicine.expiryStatus === "soon";
      const gate =
        filter === "all" ||
        (filter === "expired" && expired) ||
        (filter === "soon" && soon) ||
        (filter === "reorder" && medicine.inDate <= medicine.reorderLevel);
      return matches && gate;
    });
  }, [rows, query, filter]);

  const countable = useMemo(() => {
    const batches: ShelfBatch[] = [];
    for (const medicine of rows) {
      for (const batch of medicine.batches) batches.push({ ...batch, medicine });
    }
    return batches.sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
  }, [rows]);

  const batchChoices = countable.filter((batch) => {
    const needle = batchQuery.trim().toLowerCase();
    if (!needle) return false;
    return `${batch.medicine.name} ${batch.medicine.sku} ${batch.medicine.barcode || ""} ${batch.batchNumber} ${batch.serialNumber || ""}`.toLowerCase().includes(needle);
  }).slice(0, 6);

  const wasteChoices = countable.filter((batch) => {
    const needle = wasteQuery.trim().toLowerCase();
    if (!needle || batch.id === wastePackId) return false;
    return `${batch.medicine.name} ${batch.medicine.sku} ${batch.batchNumber} ${batch.serialNumber || ""}`.toLowerCase().includes(needle);
  }).slice(0, 6);
  const correcting = purchases.find((purchase) => purchase.id === editingPurchase) || null;
  const correctingPaid = (correcting?.payments || []).reduce((sum, payment) => sum + payment.amountCents, 0);
  const correctedTotal = editLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Math.round(Number(line.cost || 0) * 100), 0);

  const countedQty = Number(counted);
  const adjustDelta = adjustBatch && Number.isInteger(countedQty) && counted !== "" ? countedQty - adjustBatch.quantity : null;
  const expiryChanged = Boolean(adjustBatch && adjustExpiry && adjustExpiry !== dateInput(adjustBatch.expiryDate));
  const expiryPastAdjust = Boolean(adjustExpiry) && new Date(`${adjustExpiry}T00:00:00`).getTime() < new Date(new Date().toDateString()).getTime();

  const wasteRows = shelf.filter((batch) => wasteScope === "all" || batch.expiryStatus === "expired");

  async function addMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError("");
    setSaved("");
    await api("/pharmacy/medicines", session, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        medicineType: form.get("medicineType"),
        barcode: form.get("barcode") || undefined,
        sku: form.get("sku"),
        genericName: form.get("genericName") || undefined,
        strength: form.get("strength") || undefined,
        unitPriceCents: Math.round(Number(form.get("price")) * 100),
        reorderLevel: Number(form.get("reorderLevel") || 10),
      }),
    });
    formEl.reset();
    setAddingMedicine(false);
    setSaved("Medicine added to the catalog.");
    await load();
  }

  async function saveMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = String(form.get("id") || "");
    setError("");
    setSaved("");
    await api(`/pharmacy/medicines/${id}`, session, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.get("name"),
        sku: form.get("sku"),
        barcode: String(form.get("barcode") || ""),
        medicineType: form.get("medicineType"),
        genericName: String(form.get("genericName") || ""),
        strength: String(form.get("strength") || ""),
        unitPriceCents: Math.round(Number(form.get("price")) * 100),
        reorderLevel: Number(form.get("reorderLevel") || 0),
      }),
    });
    setSaved("Medicine updated.");
    await load();
  }

  function chooseLine(medicine: Medicine | null) {
    setCreating(false);
    setLineMedicine(medicine);
    if (!medicine) {
      setLineBatch("");
      setLineSerial("");
      setLineQty("");
      setLineCost("");
      setLineExpiry("");
      return;
    }
    const previous = previousLine(medicine, purchases);
    setLineBatch(previous?.batchNumber || "");
    setLineSerial("");
    setLineQty(previous ? String(previous.quantity) : "");
    setLineExpiry(previous ? dateInput(previous.expiryDate) : "");
    const cost = previous?.costCents ?? lastCost(medicine);
    setLineCost(cost === null ? "" : (cost / 100).toFixed(2));
  }

  function beginCreate(query: string) {
    const typed = query.trim();
    const barcode = /^\d{6,}$/.test(typed);
    setCreateSeed({ name: barcode ? "" : typed, barcode: barcode ? typed : "" });
    setCreating(true);
    setLineMedicine(null);
  }

  async function createForDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSaved("");
    const created = await api<Medicine>("/pharmacy/medicines", session, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        medicineType: form.get("medicineType"),
        barcode: form.get("barcode") || undefined,
        sku: form.get("sku"),
        genericName: form.get("genericName") || undefined,
        strength: form.get("strength") || undefined,
        unitPriceCents: Math.round(Number(form.get("price")) * 100),
        reorderLevel: Number(form.get("reorderLevel") || 10),
      }),
    });
    setSaved("Medicine added. Finish the batch, expiry, and cost for this delivery.");
    setCreating(false);
    chooseLine({ ...created, batches: [], onHand: 0, inDate: 0, nearestExpiry: null, expiryStatus: "none" });
    await load();
  }

  function addDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lineMedicine) {
      setError("Choose a medicine before adding the line.");
      return;
    }
    const serialNumber = lineSerial.trim();
    if (serialNumber && draft.some((line) => line.serialNumber.toLowerCase() === serialNumber.toLowerCase())) {
      setError("That serial is already on this delivery.");
      return;
    }
    setError("");
    setDraft((current) => [
      ...current,
      {
        medicineId: lineMedicine.id,
        name: lineMedicine.strength ? `${lineMedicine.name} ${lineMedicine.strength}` : lineMedicine.name,
        batchNumber: lineBatch.trim(),
        serialNumber,
        quantity: Number(lineQty),
        expiryDate: lineExpiry,
        costCents: Math.round(Number(lineCost || 0) * 100),
      },
    ]);
    setLineMedicine(null);
    setLineBatch("");
    setLineSerial("");
    setLineQty("");
    setLineCost("");
    setLineExpiry("");
    setLineFocus((value) => value + 1);
    event.currentTarget.reset();
  }

  async function postPurchase() {
    if (!invoiceRef.trim()) throw new Error("Enter the invoice reference.");
    if (draft.length === 0) throw new Error("Add at least one line before posting the purchase.");
    setError("");
    setSaved("");
    await api("/pharmacy/purchases", session, {
      method: "POST",
      body: JSON.stringify({
        reference: invoiceRef.trim(),
        supplierId: supplierId || undefined,
        notes: invoiceNote.trim() || undefined,
        lines: draft.map((line) => ({
          medicineId: line.medicineId,
          batchNumber: line.batchNumber,
          serialNumber: line.serialNumber || undefined,
          quantity: line.quantity,
          expiryDate: line.expiryDate,
          costCents: line.costCents,
        })),
      }),
    });
    setInvoiceRef("");
    setSupplierId("");
    setInvoiceNote("");
    setDraft([]);
    setSaved("Delivery posted and stock increased.");
    await load();
  }

  function chooseBatch(batch: ShelfBatch) {
    setAdjustBatch(batch);
    setCounted(String(batch.quantity));
    setAdjustExpiry(dateInput(batch.expiryDate));
    setAdjustReason("count");
    setBatchQuery("");
    setError("");
  }

  function clearBatch() {
    setAdjustBatch(null);
    setCounted("");
    setAdjustExpiry("");
    setAdjustNote("");
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustBatch) throw new Error("Choose a pack before recording the count.");
    if (!Number.isInteger(countedQty) || countedQty < 0) throw new Error("Enter the quantity you counted.");
    if (!adjustExpiry) throw new Error("Enter the expiry on the pack.");
    const delta = countedQty - adjustBatch.quantity;
    const expiryMoves = adjustExpiry !== dateInput(adjustBatch.expiryDate);
    if (delta === 0 && !expiryMoves) throw new Error("That matches the shelf. Nothing to record.");
    setError("");
    setSaved("");
    await api("/pharmacy/adjustments", session, {
      method: "POST",
      body: JSON.stringify({
        batchId: adjustBatch.id,
        quantityDelta: delta,
        expiryDate: adjustExpiry,
        reason: adjustReason,
        note: adjustNote.trim() || undefined,
      }),
    });
    setAdjustBatch(null);
    setCounted("");
    setAdjustExpiry("");
    setAdjustNote("");
    setSaved(expiryMoves && delta === 0 ? "Expiry updated." : "Adjustment recorded.");
    await load();
  }

  async function recordWaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setSaved("");
    await api("/pharmacy/waste", session, {
      method: "POST",
      body: JSON.stringify({
        batchId: form.get("batchId"),
        quantity: Number(form.get("quantity")),
        reason: form.get("reason"),
        note: form.get("note") || undefined,
      }),
    });
    setSaved("Waste recorded and taken off the shelf.");
    await load();
  }

  function openPurchase(purchase: Purchase) {
    setEditingPurchase(purchase.id);
    setEditSupplier(purchase.supplier?.id || "");
    setEditRef(purchase.reference);
    setEditNote(purchase.notes || "");
    setEditLines(
      purchase.lines.map((line) => ({
        id: line.id,
        medicineId: line.medicine.id,
        name: line.medicine.name,
        quantity: String(line.quantity),
        cost: (line.costCents / 100).toFixed(2),
        expiry: dateInput(line.expiryDate),
        batchNumber: line.batchNumber,
        serialNumber: line.serialNumber || "",
        onHand: line.batch?.quantity ?? line.quantity,
        received: line.quantity,
      })),
    );
    setError("");
  }

  function patchLine(id: string, patch: Partial<LineEdit>) {
    setEditLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  async function savePurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPurchase) return;
    if (!editRef.trim()) throw new Error("Enter the invoice reference.");
    for (const line of editLines) {
      const qty = Number(line.quantity);
      const floor = Math.max(1, line.received - line.onHand);
      if (!Number.isInteger(qty) || qty < floor) throw new Error(`${line.name} has to stay at least ${floor}.`);
      if (!line.batchNumber.trim() || !line.expiry) throw new Error("Each pack needs a batch and an expiry.");
      if (!Number.isFinite(Number(line.cost)) || Number(line.cost) < 0) throw new Error("Enter the cost of each pack.");
    }
    setError("");
    setSaved("");
    await api(`/pharmacy/purchases/${editingPurchase}`, session, {
      method: "PATCH",
      body: JSON.stringify({
        reference: editRef.trim(),
        supplierId: editSupplier || null,
        notes: editNote.trim() || null,
        lines: editLines.map((line) => ({
          id: line.id,
          medicineId: line.medicineId,
          batchNumber: line.batchNumber.trim(),
          serialNumber: line.serialNumber.trim() || undefined,
          quantity: Number(line.quantity),
          expiryDate: line.expiry,
          costCents: Math.round(Number(line.cost) * 100),
        })),
      }),
    });
    setEditingPurchase(null);
    setSaved("Delivery corrected.");
    await load();
  }

  function openWaste(row: Movement) {
    setWasteId(row.id);
    setWasteQty(String(Math.abs(row.quantity)));
    setWasteReason(wasteReasons.some(([value]) => value === row.reason) ? row.reason || "damaged" : "damaged");
    setWasteNote(row.note || "");
    setWastePackId(row.batch.id);
    setWasteQuery("");
    setError("");
  }

  async function saveWaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wasteId) return;
    const qty = Number(wasteQty);
    if (!Number.isInteger(qty) || qty < 1) throw new Error("Enter the quantity to write off.");
    setError("");
    setSaved("");
    await api(`/pharmacy/waste/${wasteId}`, session, {
      method: "PATCH",
      body: JSON.stringify({
        batchId: wastePackId,
        quantity: qty,
        reason: wasteReason,
        note: wasteNote.trim() || undefined,
      }),
    });
    setWasteId(null);
    setSaved("Write-off corrected.");
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="In date" value={String(inDatePacks)} />
        <Stat label="Past expiry" value={String(expiredPacks)} warn={expiredPacks > 0} />
        <Stat label="Reorder" value={String(reorderCount)} warn={reorderCount > 0} />
        <Stat label="Shelf cost" value={money(shelfValue)} />
      </div>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ...(canEdit ? [["catalog", "Catalog"] as const] : []),
            ...(canPurchase || canCorrect ? [["purchases", "Goods in"] as const] : []),
            ...(canEdit ? [["adjust", "Adjustments"] as const] : []),
            ...(canEdit ? [["waste", "Waste"] as const] : []),
          ]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setError("");
              setSaved("");
            }}
            className={`h-10 rounded-full px-4 text-sm ${tab === id ? "bg-moss font-semibold text-[#04281c]" : "bg-surface text-muted shadow-card"}`}
          >
            {label}
            {id === "waste" && expiredPacks > 0 ? <span className="ml-2">{expiredPacks}</span> : null}
          </button>
        ))}
      </div>
      <Notice message={error} />
      {saved ? <p className="rounded-xl border border-white/10 bg-[#143028] px-3 py-2 text-sm text-mossdeep">{saved}</p> : null}

      {tab === "catalog" ? (
        <div>
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, SKU, barcode, strength, or serial" className={`${control} max-w-sm`} />
              {canEdit ? <button type="button" className={newButton} onClick={() => { setAddingMedicine(true); setError(""); }}>New</button> : null}
              {(
                [
                  ["all", "All"],
                  ["expired", "Expired"],
                  ["soon", "Due in 90 days"],
                  ["reorder", "Reorder"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} className={`h-9 rounded-full px-3 text-sm ${filter === id ? "bg-[#1a3329] font-semibold text-mossdeep" : "bg-surface text-muted shadow-card"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-[24px] bg-surface shadow-card">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Medicine</th>
                    <th className="px-4 py-3 font-medium">Sell price</th>
                    <th className="px-4 py-3 font-medium">In date</th>
                    <th className="px-4 py-3 font-medium">Expired</th>
                    <th className="px-4 py-3 font-medium">Nearest expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((medicine) => {
                    const expiredQty = medicine.onHand - medicine.inDate;
                    const open = openId === medicine.id;
                    return (
                      <Fragment key={medicine.id}>
                        <tr className="cursor-pointer border-t border-line" onClick={() => setOpenId(open ? null : medicine.id)}>
                          <td className="px-4 py-3">
                            <span className="font-medium">{medicine.name}</span>
                            {medicine.strength ? <span className="text-muted"> {medicine.strength}</span> : null}
                            <span className="mt-0.5 block text-xs text-muted">
                              {medicine.sku} · {labelOf(types, medicine.medicineType)}
                              {medicine.barcode ? ` · ${medicine.barcode}` : ""}
                            </span>
                          </td>
                          <td className="px-4 py-3 tabular-nums">{money(medicine.unitPriceCents)}</td>
                          <td className={`px-4 py-3 tabular-nums ${medicine.inDate <= medicine.reorderLevel ? "text-[#ffb4ab]" : ""}`}>{medicine.inDate}</td>
                          <td className={`px-4 py-3 tabular-nums ${expiredQty > 0 ? "text-[#ffb4ab]" : "text-muted"}`}>{expiredQty || "—"}</td>
                          <td className="px-4 py-3"><ExpiryText status={medicine.expiryStatus} date={medicine.nearestExpiry} /></td>
                        </tr>
                        {open ? (
                          <tr className="border-t border-line bg-[#121a17]">
                            <td colSpan={5} className="px-4 py-4">
                              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">On the shelf</p>
                                  {medicine.batches.filter((batch) => batch.quantity > 0).length === 0 ? <p className="mt-2 text-sm text-muted">No packs on the shelf.</p> : null}
                                  <ul className="mt-2 space-y-2 text-sm">
                                    {medicine.batches.filter((batch) => batch.quantity > 0).map((batch) => (
                                      <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2">
                                        <span>
                                          Batch {batch.batchNumber}
                                          {batch.serialNumber ? <span className="ml-2 font-mono text-xs text-muted">{batch.serialNumber}</span> : null}
                                          <span className="mt-0.5 block text-xs text-muted">{money(batch.costCents)} each</span>
                                        </span>
                                        <span className="flex items-center gap-3">
                                          <span className="tabular-nums">{batch.quantity}</span>
                                          <ExpiryText status={batch.expiryStatus} date={batch.expiryDate} days={batch.daysToExpiry} />
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                {canEdit ? (
                                  <form className="grid gap-3" onSubmit={quietSubmit(saveMedicine, setError)} onClick={(event) => event.stopPropagation()}>
                                    <input type="hidden" name="id" value={medicine.id} />
                                    <Field label="Name"><input name="name" required defaultValue={medicine.name} className={control} /></Field>
                                    <div className="grid grid-cols-2 gap-3">
                                      <Field label="SKU"><input name="sku" required defaultValue={medicine.sku} className={control} /></Field>
                                      <Field label="Strength"><input name="strength" defaultValue={medicine.strength || ""} className={control} /></Field>
                                    </div>
                                    <Field label="Barcode"><input name="barcode" defaultValue={medicine.barcode || ""} className={control} /></Field>
                                    <Field label="Generic name"><input name="genericName" defaultValue={medicine.genericName || ""} className={control} /></Field>
                                    <Field label="Type">
                                      <select name="medicineType" className={control} defaultValue={medicine.medicineType}>
                                        {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                      </select>
                                    </Field>
                                    <div className="grid grid-cols-2 gap-3">
                                      <Field label="Sell price"><input name="price" type="number" min="0" step="0.01" required defaultValue={(medicine.unitPriceCents / 100).toFixed(2)} className={control} /></Field>
                                      <Field label="Reorder at"><input name="reorderLevel" type="number" min="0" defaultValue={medicine.reorderLevel} className={control} /></Field>
                                    </div>
                                    <PrimaryButton>Save changes</PrimaryButton>
                                  </form>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {visible.length === 0 ? (
                    <tr><td className="px-4 py-8 text-muted" colSpan={5}>Nothing matches that search.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          {addingMedicine ? (
            <Dialog title="New medicine" onClose={() => setAddingMedicine(false)}>
              <form className="grid gap-3 p-4 sm:grid-cols-2" onSubmit={quietSubmit(addMedicine, setError)}>
                <div className="sm:col-span-2"><Notice message={error} /></div>
                <Field label="Name"><input name="name" required className={control} /></Field>
                <Field label="Type">
                  <select name="medicineType" className={control} defaultValue="tablet">
                    {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Barcode"><input name="barcode" className={control} placeholder="Scan or type" /></Field>
                <Field label="SKU"><input name="sku" required className={control} /></Field>
                <Field label="Strength"><input name="strength" className={control} placeholder="500 mg" /></Field>
                <Field label="Generic name"><input name="genericName" className={control} /></Field>
                <Field label="Sell price"><input name="price" type="number" min="0" step="0.01" required className={control} /></Field>
                <Field label="Reorder at"><input name="reorderLevel" type="number" min="0" defaultValue={10} className={control} /></Field>
                <div className="sm:col-span-2"><PrimaryButton>Add medicine</PrimaryButton></div>
              </form>
            </Dialog>
          ) : null}
        </div>
      ) : null}

      {tab === "purchases" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {correcting ? (
            <form className="grid gap-3 overflow-hidden rounded-[24px] bg-surface p-4 shadow-card" onSubmit={quietSubmit(savePurchase, setError)}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Correct {correcting.reference}</h2>
                  <p className="mt-0.5 text-xs text-muted">Saving updates the shelf and what the supplier is owed.</p>
                </div>
                <button type="button" className="text-xs text-muted" onClick={() => setEditingPurchase(null)}>Cancel</button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Supplier">
                  <select value={editSupplier} onChange={(event) => setEditSupplier(event.target.value)} className={control}>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </Field>
                <Field label="Invoice reference"><input value={editRef} onChange={(event) => setEditRef(event.target.value)} required className={control} /></Field>
              </div>
              {(correcting.supplier?.id || "") !== editSupplier ? (
                <p className="text-xs text-[#f3d7a1]">Payments already recorded stay with {correcting.supplier?.name || "the previous supplier"}.</p>
              ) : null}
              <Field label="Note"><input value={editNote} onChange={(event) => setEditNote(event.target.value)} className={control} placeholder="Optional" /></Field>
              {editLines.map((line) => {
                const floor = Math.max(1, line.received - line.onHand);
                const qty = Number(line.quantity);
                const delta = Number.isInteger(qty) ? qty - line.received : null;
                const moved = line.onHand !== line.received;
                return (
                  <div key={line.id} className="grid gap-2 rounded-xl border border-line p-3">
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Field label="Medicine">
                          <select
                            value={line.medicineId}
                            disabled={moved}
                            onChange={(event) => {
                              const medicine = rows.find((item) => item.id === event.target.value);
                              patchLine(line.id, { medicineId: event.target.value, name: medicine?.name || line.name });
                            }}
                            className={control}
                          >
                            {rows.some((medicine) => medicine.id === line.medicineId) ? null : <option value={line.medicineId}>{line.name}</option>}
                            {rows.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name}{medicine.strength ? ` ${medicine.strength}` : ""}</option>)}
                          </select>
                        </Field>
                      </div>
                      {editLines.length > 1 ? (
                        <button type="button" className="mb-2 text-xs text-muted" onClick={() => setEditLines((current) => current.filter((item) => item.id !== line.id))}>Remove</button>
                      ) : null}
                    </div>
                    {moved ? <p className="text-xs text-muted">Some of this pack has already moved, so the medicine stays. Quantity has to stay at least {floor}.</p> : null}
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Batch"><input value={line.batchNumber} onChange={(event) => patchLine(line.id, { batchNumber: event.target.value })} required className={control} /></Field>
                      <Field label="Serial"><input value={line.serialNumber} onChange={(event) => patchLine(line.id, { serialNumber: event.target.value })} className={control} placeholder="Optional" /></Field>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <Field label="Quantity"><input value={line.quantity} onChange={(event) => patchLine(line.id, { quantity: event.target.value })} type="number" min={floor} required className={control} /></Field>
                      <Field label="Expiry"><input value={line.expiry} onChange={(event) => patchLine(line.id, { expiry: event.target.value })} type="date" required className={control} /></Field>
                      <Field label="Cost each"><input value={line.cost} onChange={(event) => patchLine(line.id, { cost: event.target.value })} type="number" min="0" step="0.01" required className={control} /></Field>
                    </div>
                    {delta === null || delta === 0 ? null : (
                      <p className={`text-xs ${delta < 0 ? "text-[#ffb4ab]" : "text-mossdeep"}`}>
                        {delta > 0 ? `Add ${delta} to the shelf.` : `Remove ${Math.abs(delta)} from the shelf.`}
                      </p>
                    )}
                  </div>
                );
              })}
              {correctingPaid > 0 && correctedTotal < correctingPaid ? (
                <p className="text-xs text-[#ffb4ab]">This invoice already has {money(correctingPaid)} paid against it. The corrected total has to stay at least that.</p>
              ) : null}
              <PrimaryButton disabled={correctingPaid > 0 && correctedTotal < correctingPaid}>Save correction</PrimaryButton>
            </form>
          ) : (
          <section className="overflow-hidden rounded-[24px] bg-surface shadow-card">
            <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold">This delivery</h2>
                <p className="mt-0.5 text-xs text-muted">Supplier and invoice first, then each pack.</p>
              </div>
              <p className="text-right">
                <span className="block text-xs text-muted">{draft.length} {draft.length === 1 ? "line" : "lines"}</span>
                <span className="text-lg font-semibold tabular-nums">{money(invoiceTotal)}</span>
              </p>
            </header>
            {canEdit ? (
              <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2">
                <Field label="Supplier">
                  <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className={control}>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </Field>
                <Field label="Invoice reference"><input value={invoiceRef} onChange={(event) => setInvoiceRef(event.target.value)} className={control} placeholder="INV-1044" /></Field>
              </div>
            ) : null}
            {canEdit && creating ? (
              <form className="grid gap-3 border-b border-line p-4" onSubmit={quietSubmit(createForDelivery, setError)}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">New medicine</p>
                  <button type="button" className="text-xs text-muted" onClick={() => setCreating(false)}>Cancel</button>
                </div>
                <Field label="Name"><input name="name" required defaultValue={createSeed.name} className={control} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type">
                    <select name="medicineType" className={control} defaultValue="tablet">
                      {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Strength"><input name="strength" className={control} placeholder="500 mg" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SKU"><input name="sku" required defaultValue={suggestSku(createSeed.name)} className={control} /></Field>
                  <Field label="Barcode"><input name="barcode" defaultValue={createSeed.barcode} className={control} placeholder="Scan or type" /></Field>
                </div>
                <Field label="Generic name"><input name="genericName" className={control} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sell price"><input name="price" type="number" min="0" step="0.01" required className={control} /></Field>
                  <Field label="Reorder at"><input name="reorderLevel" type="number" min="0" defaultValue={10} className={control} /></Field>
                </div>
                <PrimaryButton>Create and use it</PrimaryButton>
              </form>
            ) : null}
            {canEdit && !creating ? (
              <form className="grid gap-3 border-b border-line p-4" onSubmit={addDraft}>
                <Field label="Medicine">
                  <MedicineFinder rows={rows} selected={lineMedicine} onPick={chooseLine} onCreate={beginCreate} focusKey={lineFocus} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Batch number"><input value={lineBatch} onChange={(event) => setLineBatch(event.target.value)} required className={control} /></Field>
                  <Field label="Serial number"><input value={lineSerial} onChange={(event) => setLineSerial(event.target.value)} className={control} placeholder="Optional" /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Quantity"><input value={lineQty} onChange={(event) => setLineQty(event.target.value)} type="number" min="1" required className={control} /></Field>
                  <Field label="Expiry">
                    <input value={lineExpiry} onChange={(event) => setLineExpiry(event.target.value)} type="date" required className={control} />
                  </Field>
                  <Field label="Cost each">
                    <input value={lineCost} onChange={(event) => setLineCost(event.target.value)} type="number" min="0" step="0.01" required className={control} />
                  </Field>
                </div>
                {filledFromLast ? <p className="text-xs text-muted">Filled from the last delivery of this medicine. Change the batch and expiry if this invoice is different.</p> : null}
                {expiryPast ? <p className="text-xs text-[#ffb4ab]">That expiry is already past. The pack can still be received, and it will sit with the expired stock.</p> : null}
                <button className="h-10 rounded-full border border-line text-sm">Add line</button>
              </form>
            ) : null}
            <ul>
              {draft.map((line, index) => {
                const late = new Date(`${line.expiryDate}T00:00:00`).getTime() < new Date(new Date().toDateString()).getTime();
                return (
                  <li key={`${line.medicineId}-${line.batchNumber}-${index}`} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm">
                    <span>
                      <span className="font-medium">{line.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {line.batchNumber}{line.serialNumber ? ` · ${line.serialNumber}` : ""} · {line.quantity} × {money(line.costCents)} · {line.expiryDate}
                        {late ? <span className="text-[#ffb4ab]"> · past expiry</span> : null}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{money(line.quantity * line.costCents)}</span>
                      <button className="text-xs text-muted" onClick={() => setDraft((current) => current.filter((_, item) => item !== index))}>Remove</button>
                    </span>
                  </li>
                );
              })}
              {draft.length === 0 ? <li className="px-5 py-6 text-sm text-muted">No packs on this delivery yet.</li> : null}
            </ul>
            {canEdit ? (
              <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Note"><input value={invoiceNote} onChange={(event) => setInvoiceNote(event.target.value)} className={control} placeholder="Optional" /></Field>
                <PrimaryButton type="button" onClick={() => postPurchase().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not post the delivery"))}>Post delivery</PrimaryButton>
              </div>
            ) : null}
          </section>
          )}
          <Panel title="Recent deliveries">
            <ul>
              {purchases.map((purchase) => {
                const total = purchase.lines.reduce((sum, line) => sum + line.quantity * line.costCents, 0);
                const packs = purchase.lines.reduce((sum, line) => sum + line.quantity, 0);
                return (
                  <li key={purchase.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        <span className="font-medium">{purchase.reference}</span>
                        <span className="mt-0.5 block text-xs text-muted">{purchase.supplier?.name || "No supplier"} · {packs} {packs === 1 ? "pack" : "packs"}</span>
                      </span>
                      <span className="text-right">
                        <span className="block tabular-nums">{money(total)}</span>
                        <span className="text-xs text-muted">{when(purchase.createdAt)}</span>
                        {canCorrect ? (
                          <button type="button" className="mt-1 text-xs font-semibold text-moss" onClick={() => openPurchase(purchase)}>Correct</button>
                        ) : null}
                      </span>
                    </div>
                    {purchase.lines.map((line) => (
                      <p key={line.id} className="mt-1 text-xs text-muted">
                        {line.medicine.name} · {line.batchNumber} · {line.quantity} × {money(line.costCents)} · exp {when(line.expiryDate)}
                      </p>
                    ))}
                  </li>
                );
              })}
              {purchases.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No deliveries posted yet.</li> : null}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "adjust" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          {canEdit ? (
            <section className="overflow-hidden rounded-[24px] bg-surface shadow-card">
              <header className="border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold">Stock count</h2>
                <p className="mt-0.5 text-xs text-muted">Find the pack, then correct the count and the expiry.</p>
              </header>
              <form className="grid gap-3 p-4" onSubmit={quietSubmit(adjust, setError)}>
                <Field label="Pack">
                  {adjustBatch ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-[#121a17] px-3 py-2 text-sm">
                      <span>
                        <span className="font-medium">{adjustBatch.medicine.name}{adjustBatch.medicine.strength ? ` ${adjustBatch.medicine.strength}` : ""}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {adjustBatch.batchNumber}{adjustBatch.serialNumber ? ` · ${adjustBatch.serialNumber}` : ""} · {adjustBatch.quantity} on hand · exp {when(adjustBatch.expiryDate)}
                        </span>
                      </span>
                      <button type="button" className="text-xs text-muted" onClick={clearBatch}>Change</button>
                    </div>
                  ) : (
                    <input value={batchQuery} onChange={(event) => setBatchQuery(event.target.value)} placeholder="Name, batch, barcode, or serial" className={control} />
                  )}
                </Field>
                {!adjustBatch && batchChoices.length ? (
                  <ul className="overflow-hidden rounded-xl border border-line bg-[#121a17]">
                    {batchChoices.map((batch) => (
                      <li key={batch.id}>
                        <button type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => chooseBatch(batch)}>
                          <span className="font-medium">{batch.medicine.name}</span>
                          {batch.medicine.strength ? <span className="text-muted"> {batch.medicine.strength}</span> : null}
                          <span className="mt-0.5 block text-xs text-muted">{batch.batchNumber}{batch.serialNumber ? ` · ${batch.serialNumber}` : ""} · {batch.quantity} on hand · exp {when(batch.expiryDate)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {adjustBatch ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Counted">
                        <input value={counted} onChange={(event) => setCounted(event.target.value)} type="number" min="0" required className={control} />
                      </Field>
                      <Field label="Expiry">
                        <input value={adjustExpiry} onChange={(event) => setAdjustExpiry(event.target.value)} type="date" required className={control} />
                      </Field>
                    </div>
                    <Field label="Reason">
                      <select value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} className={control}>
                        {adjustReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    <Field label="Note"><input value={adjustNote} onChange={(event) => setAdjustNote(event.target.value)} className={control} placeholder="Optional" /></Field>
                    {adjustDelta === null ? null : (
                      <div className="grid gap-1 text-xs">
                        {adjustDelta === 0 ? (
                          <p className="text-muted">The count matches the shelf.</p>
                        ) : (
                          <p className={adjustDelta < 0 ? "text-[#ffb4ab]" : "text-mossdeep"}>
                            {adjustDelta > 0 ? `Add ${adjustDelta}` : `Remove ${Math.abs(adjustDelta)}`}. The shelf becomes {countedQty}.
                          </p>
                        )}
                        {expiryChanged ? (
                          <p className={expiryPastAdjust ? "text-[#ffb4ab]" : "text-mossdeep"}>
                            Expiry moves to {writtenDate(adjustExpiry)}.{expiryPastAdjust ? " That date is already past." : ""}
                          </p>
                        ) : (
                          <p className="text-muted">Expiry stays {when(adjustBatch.expiryDate)}.</p>
                        )}
                      </div>
                    )}
                    <PrimaryButton disabled={adjustDelta === null || (adjustDelta === 0 && !expiryChanged)}>Record adjustment</PrimaryButton>
                  </>
                ) : (
                  <p className="text-sm text-muted">Search for the pack you counted. Empty batches are included, so a missing pack can be put back.</p>
                )}
              </form>
            </section>
          ) : null}
          <MovementList title="Adjustment book" rows={adjustments} empty="No adjustments yet." />
        </div>
      ) : null}

      {tab === "waste" ? (
        <div className="grid items-start gap-5">
          <Panel
            title={wasteScope === "expired" ? "Past expiry" : "Whole shelf"}
            action={
              <button className="text-xs font-semibold text-moss" onClick={() => setWasteScope(wasteScope === "expired" ? "all" : "expired")}>
                {wasteScope === "expired" ? "Show the rest of the shelf" : "Only past expiry"}
              </button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Pack</th>
                    <th className="px-4 py-3 font-medium">Expiry</th>
                    <th className="px-4 py-3 font-medium">On hand</th>
                    {canEdit ? <th className="px-4 py-3 font-medium">Write off</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {wasteRows.map((batch) => (
                    <tr key={batch.id} className="border-t border-line align-top">
                      <td className="px-4 py-3">
                        <span className="font-medium">{batch.medicine.name}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {batch.batchNumber}{batch.serialNumber ? ` · ${batch.serialNumber}` : ""}
                        </span>
                      </td>
                      <td className="px-4 py-3"><ExpiryText status={batch.expiryStatus} date={batch.expiryDate} days={batch.daysToExpiry} /></td>
                      <td className="px-4 py-3 tabular-nums">{batch.quantity}</td>
                      {canEdit ? (
                        <td className="px-4 py-3">
                          <form key={`${batch.id}-${batch.quantity}`} className="flex flex-wrap items-center gap-2" onSubmit={quietSubmit(recordWaste, setError)}>
                            <input type="hidden" name="batchId" value={batch.id} />
                            <input name="quantity" type="number" min="1" max={batch.quantity} defaultValue={batch.expiryStatus === "expired" ? batch.quantity : 1} className={`${control} w-20`} />
                            <select name="reason" defaultValue={batch.expiryStatus === "expired" ? "expired" : "damaged"} className={`${control} w-36`}>
                              {wasteReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <input name="note" placeholder="Note" className={`${control} w-36`} />
                            <button className="h-9 rounded-full bg-[#8d332c] px-3 text-sm font-medium text-white">Waste</button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {wasteRows.length === 0 ? (
                    <tr><td className="px-4 py-8 text-muted" colSpan={canEdit ? 4 : 3}>{wasteScope === "expired" ? "Nothing on the shelf is past expiry." : "The shelf is empty."}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
          {canCorrect && wasteId ? (
            <section className="overflow-hidden rounded-[24px] bg-surface shadow-card">
              <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">Correct this write-off</h2>
                  <p className="mt-0.5 text-xs text-muted">The shelf follows the quantity and the pack you save.</p>
                </div>
                <button type="button" className="text-xs text-muted" onClick={() => setWasteId(null)}>Cancel</button>
              </header>
              <form className="grid gap-3 p-4" onSubmit={quietSubmit(saveWaste, setError)}>
                <Field label="Pack">
                  {wasteQuery || !wastePackId ? (
                    <input value={wasteQuery} onChange={(event) => setWasteQuery(event.target.value)} placeholder="Name, batch, barcode, or serial" className={control} />
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-[#121a17] px-3 py-2">
                      <span className="text-sm">{wastePackLabel(wastePackId, waste, countable)}</span>
                      <button type="button" className="text-xs text-muted" onClick={() => { setWasteQuery(""); setWastePackId(""); }}>Change</button>
                    </div>
                  )}
                </Field>
                {wasteChoices.length ? (
                  <ul className="overflow-hidden rounded-xl border border-line bg-[#121a17]">
                    {wasteChoices.map((batch) => (
                      <li key={batch.id}>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                          onClick={() => {
                            setWastePackId(batch.id);
                            setWasteQuery("");
                          }}
                        >
                          <span className="font-medium">{batch.medicine.name}</span>
                          <span className="mt-0.5 block text-xs text-muted">{batch.batchNumber} · {batch.quantity} on hand · exp {when(batch.expiryDate)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Quantity"><input value={wasteQty} onChange={(event) => setWasteQty(event.target.value)} type="number" min="1" required className={control} /></Field>
                  <Field label="Reason">
                    <select value={wasteReason} onChange={(event) => setWasteReason(event.target.value)} className={control}>
                      {wasteReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Note"><input value={wasteNote} onChange={(event) => setWasteNote(event.target.value)} className={control} placeholder="Optional" /></Field>
                <WastePreview row={waste.find((row) => row.id === wasteId) || null} quantity={wasteQty} packId={wastePackId} packs={countable} />
                <PrimaryButton disabled={!wastePackId}>Save correction</PrimaryButton>
              </form>
            </section>
          ) : null}
          <Panel title="Waste book">
            <ul>
              {waste.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0">
                  <span>
                    <span className="font-medium">{row.medicine.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {row.batch.batchNumber} · {labelReason(row.reason)}{row.note ? ` · ${row.note}` : ""}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block tabular-nums text-[#ffb4ab]">{row.quantity}</span>
                    <span className="text-xs text-muted">{when(row.createdAt)}</span>
                    {canCorrect ? (
                      <button type="button" className="mt-1 block w-full text-xs font-semibold text-moss" onClick={() => openWaste(row)}>Correct</button>
                    ) : null}
                  </span>
                </li>
              ))}
              {waste.length === 0 ? <li className="px-4 py-6 text-sm text-muted">Nothing has been written off.</li> : null}
            </ul>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[24px] bg-surface px-4 py-3 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-[#ffb4ab]" : ""}`}>{value}</p>
    </div>
  );
}

function lastCost(medicine: Medicine) {
  const newest = [...medicine.batches].sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime())[0];
  return newest ? newest.costCents : null;
}

function previousLine(medicine: Medicine, purchases: Purchase[]) {
  for (const purchase of purchases) {
    const line = purchase.lines.find((item) => item.medicine.id === medicine.id);
    if (line) return line;
  }
  return null;
}

function dateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function wastePackLabel(packId: string, rows: Movement[], packs: ShelfBatch[]) {
  const pack = packs.find((batch) => batch.id === packId);
  if (pack) return `${pack.medicine.name}${pack.medicine.strength ? ` ${pack.medicine.strength}` : ""} · ${pack.batchNumber}`;
  const row = rows.find((item) => item.batch.id === packId);
  return row ? `${row.medicine.name} · ${row.batch.batchNumber}` : "Choose a pack";
}

function WastePreview({ row, quantity, packId, packs }: { row: Movement | null; quantity: string; packId: string; packs: ShelfBatch[] }) {
  if (!row || !packId) return null;
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) return null;
  const written = Math.abs(row.quantity);
  if (packId !== row.batch.id) {
    const next = packs.find((batch) => batch.id === packId);
    return (
      <p className="text-xs text-mossdeep">
        Put {written} back on {row.batch.batchNumber}. Write off {qty} from {next?.batchNumber || "the new pack"}.
      </p>
    );
  }
  const delta = qty - written;
  if (delta === 0) return <p className="text-xs text-muted">The quantity stays {written}.</p>;
  return (
    <p className={`text-xs ${delta > 0 ? "text-[#ffb4ab]" : "text-mossdeep"}`}>
      {delta > 0 ? `Write off ${delta} more.` : `Put ${Math.abs(delta)} back on the shelf.`}
    </p>
  );
}

function writtenDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function suggestSku(name: string) {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12);
  return base || "NEW";
}

function MedicineFinder({ rows, selected, onPick, onCreate, focusKey = 0 }: { rows: Medicine[]; selected: Medicine | null; onPick: (medicine: Medicine | null) => void; onCreate: (query: string) => void; focusKey?: number }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? rows.filter((medicine) => `${medicine.name} ${medicine.sku} ${medicine.barcode || ""} ${medicine.strength || ""} ${medicine.genericName || ""}`.toLowerCase().includes(needle)).slice(0, 6)
    : [];

  useEffect(() => {
    if (!selected) inputRef.current?.focus();
  }, [focusKey, selected]);

  function pickFromQuery(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !needle) return;
    const exact = rows.find((medicine) => medicine.barcode?.toLowerCase() === needle || medicine.sku.toLowerCase() === needle);
    const pick = exact || (matches.length === 1 ? matches[0] : null);
    if (!pick) return;
    event.preventDefault();
    onPick(pick);
    setQuery("");
  }

  return (
    <div>
      {selected ? (
        <div className="flex h-11 items-center justify-between rounded-lg border border-line bg-[#121a17] px-3 text-sm">
          <span className="truncate font-medium">{selected.name}{selected.strength ? ` ${selected.strength}` : ""}</span>
          <button type="button" className="text-xs text-muted" onClick={() => onPick(null)}>Change</button>
        </div>
      ) : (
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={pickFromQuery} placeholder="Name, SKU, or scan a barcode" className={control} />
      )}
      {matches.length ? (
        <ul className="mt-1 overflow-hidden rounded-xl border border-line bg-[#121a17]">
          {matches.map((medicine) => (
            <li key={medicine.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-white/5"
                onClick={() => {
                  onPick(medicine);
                  setQuery("");
                }}
              >
                <span className="font-medium">{medicine.name}</span>
                {medicine.strength ? <span className="text-muted"> {medicine.strength}</span> : null}
                <span className="mt-0.5 block text-xs text-muted">{medicine.sku}{medicine.barcode ? ` · ${medicine.barcode}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!selected ? (
        <button type="button" className="mt-2 text-xs font-semibold text-moss" onClick={() => onCreate(query)}>
          {needle ? `New medicine “${query.trim()}”` : "New medicine"}
        </button>
      ) : null}
    </div>
  );
}

function ExpiryText({ status, date, days }: { status: string; date: string | null; days?: number }) {
  if (!date || status === "none") return <span className="text-muted">—</span>;
  const tone = status === "expired" ? "text-[#ffb4ab]" : status === "critical" ? "text-[#f3d7a1]" : status === "soon" ? "text-[#d7c27a]" : "text-muted";
  const extra = days === undefined ? "" : days < 0 ? ` · ${Math.abs(days)}d overdue` : days === 0 ? " · today" : ` · ${days}d`;
  return <span className={tone}>{when(date)}{extra}</span>;
}

function MovementList({ title, rows, empty }: { title: string; rows: Movement[]; empty: string }) {
  return (
    <Panel title={title}>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0">
            <span>
              <span className="font-medium">{row.medicine.name}</span>
              <span className="mt-0.5 block text-xs text-muted">
                {row.batch.batchNumber} · {labelReason(row.reason)}
                {row.expiryTo ? ` · exp ${when(row.expiryFrom || row.expiryTo)} → ${when(row.expiryTo)}` : ""}
                {row.note ? ` · ${row.note}` : ""}
              </span>
            </span>
            <span className="text-right">
              {row.quantity === 0 && row.expiryTo ? (
                <span className="block text-mossdeep">Expiry</span>
              ) : (
                <span className={`block tabular-nums ${row.quantity < 0 ? "text-[#ffb4ab]" : "text-mossdeep"}`}>{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</span>
              )}
              <span className="text-xs text-muted">{when(row.createdAt)}</span>
            </span>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-4 py-6 text-sm text-muted">{empty}</li> : null}
      </ul>
    </Panel>
  );
}

function labelOf(options: readonly (readonly [string, string])[], value: string) {
  return options.find((option) => option[0] === value)?.[1] || value;
}

function labelReason(reason: string | null) {
  return labelOf([...wasteReasons, ...adjustReasons, ["purchase", "Purchase"], ["sale", "Sale"], ["goods in", "Goods in"]], reason || "");
}
