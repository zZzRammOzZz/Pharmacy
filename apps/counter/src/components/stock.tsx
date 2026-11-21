"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { api, Session, when } from "@/lib/api";
import { Batch, Medicine, Supplier } from "@/lib/types";
import { Field, Notice, Panel, PrimaryButton, control, quietSubmit } from "./ui";

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
] as const;

type Tab = "catalog" | "purchases" | "adjust" | "waste";
type ShelfBatch = Batch & { medicine: Medicine };

type Purchase = {
  id: string;
  reference: string;
  createdAt: string;
  lines: { id: string; quantity: number; batchNumber: string; serialNumber: string | null; expiryDate: string; medicine: { name: string } }[];
};

type Movement = {
  id: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  createdAt: string;
  medicine: { name: string };
  batch: { batchNumber: string };
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
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const canEdit = session.user.role === "owner" || session.user.role === "pharmacist";

  async function load() {
    const [medicines, purchaseRows, adjustmentRows, wasteRows] = await Promise.all([
      api<Medicine[]>("/pharmacy/medicines", session),
      api<Purchase[]>("/pharmacy/purchases", session),
      api<Movement[]>("/pharmacy/movements?kind=adjustment", session),
      api<Movement[]>("/pharmacy/movements?kind=waste", session),
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
  }, []);

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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((medicine) => {
      const serials = medicine.batches.map((batch) => batch.serialNumber || "").join(" ");
      const matches = !needle || `${medicine.name} ${medicine.sku} ${medicine.barcode || ""} ${medicine.genericName || ""} ${serials}`.toLowerCase().includes(needle);
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
    setSaved("Medicine added to the catalog.");
    await load();
  }

  function addDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const medicine = rows.find((item) => item.id === form.get("medicineId"));
    if (!medicine) return;
    setDraft((current) => [
      ...current,
      {
        medicineId: medicine.id,
        name: medicine.name,
        batchNumber: String(form.get("batchNumber") || ""),
        serialNumber: String(form.get("serialNumber") || ""),
        quantity: Number(form.get("quantity")),
        expiryDate: String(form.get("expiryDate") || ""),
        costCents: Math.round(Number(form.get("cost") || 0) * 100),
      },
    ]);
    event.currentTarget.reset();
  }

  async function postPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    if (draft.length === 0) throw new Error("Add at least one line before posting the purchase.");
    setError("");
    setSaved("");
    await api("/pharmacy/purchases", session, {
      method: "POST",
      body: JSON.stringify({
        reference: form.get("reference"),
        supplierId: form.get("supplierId") || undefined,
        notes: form.get("notes") || undefined,
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
    formEl.reset();
    setDraft([]);
    setSaved("Purchase posted and stock increased.");
    await load();
  }

  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const amount = Number(form.get("quantity"));
    const delta = form.get("direction") === "remove" ? -amount : amount;
    setError("");
    setSaved("");
    await api("/pharmacy/adjustments", session, {
      method: "POST",
      body: JSON.stringify({
        batchId: form.get("batchId"),
        quantityDelta: delta,
        reason: form.get("reason"),
        note: form.get("note") || undefined,
      }),
    });
    formEl.reset();
    setSaved("Adjustment recorded.");
    await load();
  }

  async function recordWaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
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

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2">
        {(
          [
            ["catalog", "Catalog"],
            ["purchases", "Purchases"],
            ["adjust", "Adjustments"],
            ["waste", "Waste"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setError("");
              setSaved("");
            }}
            className={`h-10 rounded-lg px-3.5 text-sm ${tab === id ? "bg-[#1a3329] font-semibold text-mossdeep" : "border border-line bg-surface text-muted shadow-sm"}`}
          >
            {label}
            {id === "waste" && expiredPacks > 0 ? <span className="ml-2 text-[#ffb4ab]">{expiredPacks}</span> : null}
          </button>
        ))}
      </div>
      <Notice message={error} />
      {saved ? <p className="mb-3 rounded-sm border border-[#cfe3d8] bg-[#143028] px-3 py-2 text-sm text-mossdeep">{saved}</p> : null}

      {tab === "catalog" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            {expiredPacks > 0 ? (
              <p className="mb-3 rounded-sm border border-[#efd0cc] bg-[#2a1715] px-3 py-2 text-sm text-[#ffb4ab]">
                {expiredPacks} packs are past expiry. They cannot be sold. Record them under Waste.
              </p>
            ) : null}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, SKU, barcode, or serial" className={`${control} max-w-sm`} />
              {(
                [
                  ["all", "All"],
                  ["expired", "Expired"],
                  ["soon", "Due in 90 days"],
                  ["reorder", "Reorder"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} onClick={() => setFilter(id)} className={`h-9 border px-3 text-sm ${filter === id ? "border-moss bg-[#1a3329]" : "border-line bg-surface"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto rounded-sm border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#121a17] text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Medicine</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Barcode</th>
                    <th className="px-3 py-2 font-medium">In date</th>
                    <th className="px-3 py-2 font-medium">Expired</th>
                    <th className="px-3 py-2 font-medium">Nearest expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((medicine) => {
                    const expiredQty = medicine.onHand - medicine.inDate;
                    return (
                      <Fragment key={medicine.id}>
                        <tr className="cursor-pointer border-t border-line" onClick={() => setOpenId(openId === medicine.id ? null : medicine.id)}>
                          <td className="px-3 py-3">
                            <span className="font-medium">{medicine.name}</span>
                            {medicine.strength ? <span className="text-muted"> {medicine.strength}</span> : null}
                            <span className="mt-0.5 block text-xs text-muted">{medicine.sku}</span>
                          </td>
                          <td className="px-3 py-3 capitalize">{labelOf(types, medicine.medicineType)}</td>
                          <td className="px-3 py-3 font-mono text-xs">{medicine.barcode || "—"}</td>
                          <td className={`px-3 py-3 tabular-nums ${medicine.inDate <= medicine.reorderLevel ? "text-[#ffb4ab]" : ""}`}>{medicine.inDate}</td>
                          <td className={`px-3 py-3 tabular-nums ${expiredQty > 0 ? "text-[#ffb4ab]" : "text-muted"}`}>{expiredQty || "—"}</td>
                          <td className="px-3 py-3"><ExpiryText status={medicine.expiryStatus} date={medicine.nearestExpiry} /></td>
                        </tr>
                        {openId === medicine.id ? (
                          <tr className="border-t border-line bg-[#121a17]">
                            <td colSpan={6} className="px-3 py-3">
                              {medicine.batches.filter((batch) => batch.quantity > 0).length === 0 ? <p className="text-sm text-muted">No packs on the shelf.</p> : null}
                              <ul className="space-y-1 text-sm">
                                {medicine.batches.filter((batch) => batch.quantity > 0).map((batch) => (
                                  <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                      Batch {batch.batchNumber}
                                      {batch.serialNumber ? <span className="ml-2 font-mono text-xs text-muted">{batch.serialNumber}</span> : null}
                                    </span>
                                    <span className="flex items-center gap-3">
                                      <span className="tabular-nums">{batch.quantity}</span>
                                      <ExpiryText status={batch.expiryStatus} date={batch.expiryDate} days={batch.daysToExpiry} />
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {visible.length === 0 ? (
                    <tr><td className="px-3 py-8 text-muted" colSpan={6}>Nothing matches that search.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          {canEdit ? (
            <Panel title="New medicine">
              <form className="grid gap-3 p-4" onSubmit={quietSubmit(addMedicine, setError)}>
                <Field label="Name"><input name="name" required className={control} /></Field>
                <Field label="Type">
                  <select name="medicineType" className={control} defaultValue="tablet">
                    {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Barcode"><input name="barcode" className={control} placeholder="Scan or type" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SKU"><input name="sku" required className={control} /></Field>
                  <Field label="Strength"><input name="strength" className={control} placeholder="500 mg" /></Field>
                </div>
                <Field label="Generic name"><input name="genericName" className={control} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sell price"><input name="price" type="number" min="0" step="0.01" required className={control} /></Field>
                  <Field label="Reorder at"><input name="reorderLevel" type="number" min="0" defaultValue={10} className={control} /></Field>
                </div>
                <PrimaryButton>Add medicine</PrimaryButton>
              </form>
            </Panel>
          ) : null}
        </div>
      ) : null}

      {tab === "purchases" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel title="Goods in">
            {canEdit ? (
              <form className="grid gap-3 border-b border-line p-4" onSubmit={addDraft}>
                <Field label="Medicine">
                  <select name="medicineId" required className={control} defaultValue="">
                    <option value="" disabled>Select</option>
                    {rows.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.sku}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Batch number"><input name="batchNumber" required className={control} /></Field>
                  <Field label="Serial number"><input name="serialNumber" className={control} placeholder="Optional" /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Quantity"><input name="quantity" type="number" min="1" required className={control} /></Field>
                  <Field label="Expiry"><input name="expiryDate" type="date" required className={control} /></Field>
                  <Field label="Cost each"><input name="cost" type="number" min="0" step="0.01" defaultValue={0} className={control} /></Field>
                </div>
                <button className="h-9 rounded-sm border border-line bg-surface text-sm">Add line</button>
              </form>
            ) : null}
            <ul>
              {draft.map((line, index) => (
                <li key={`${line.batchNumber}-${index}`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{line.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {line.batchNumber}{line.serialNumber ? ` · ${line.serialNumber}` : ""} · {line.quantity} · {line.expiryDate}
                    </span>
                  </span>
                  <button className="text-xs text-muted" onClick={() => setDraft((current) => current.filter((_, item) => item !== index))}>Remove</button>
                </li>
              ))}
              {draft.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No lines yet. Expiry is required on every pack.</li> : null}
            </ul>
            {canEdit ? (
              <form className="grid gap-3 p-4" onSubmit={quietSubmit(postPurchase, setError)}>
                <Field label="Invoice reference"><input name="reference" required className={control} placeholder="INV-1044" /></Field>
                <Field label="Supplier">
                  <select name="supplierId" className={control} defaultValue="">
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </Field>
                <Field label="Note"><input name="notes" className={control} /></Field>
                <PrimaryButton>Post purchase</PrimaryButton>
              </form>
            ) : null}
          </Panel>
          <Panel title="Recent purchases">
            <ul>
              {purchases.map((purchase) => (
                <li key={purchase.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{purchase.reference}</span>
                    <span className="text-xs text-muted">{when(purchase.createdAt)}</span>
                  </div>
                  {purchase.lines.map((line) => (
                    <p key={line.id} className="mt-1 text-xs text-muted">
                      {line.medicine.name} · {line.batchNumber}{line.serialNumber ? ` · ${line.serialNumber}` : ""} · {line.quantity} · exp {when(line.expiryDate)}
                    </p>
                  ))}
                </li>
              ))}
              {purchases.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No purchases posted yet.</li> : null}
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "adjust" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          {canEdit ? (
            <Panel title="Stock adjustment">
              <form className="grid gap-3 p-4" onSubmit={quietSubmit(adjust, setError)}>
                <Field label="Batch">
                  <select name="batchId" required className={control} defaultValue="">
                    <option value="" disabled>Select</option>
                    {shelf.map((batch) => (
                      <option key={batch.id} value={batch.id}>
                        {batch.medicine.name} · {batch.batchNumber} · {batch.quantity} on hand
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Direction">
                    <select name="direction" className={control} defaultValue="add">
                      <option value="add">Add</option>
                      <option value="remove">Remove</option>
                    </select>
                  </Field>
                  <Field label="Quantity"><input name="quantity" type="number" min="1" required className={control} /></Field>
                </div>
                <Field label="Reason">
                  <select name="reason" className={control} defaultValue="count">
                    {adjustReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Note"><input name="note" className={control} /></Field>
                <PrimaryButton>Record adjustment</PrimaryButton>
              </form>
            </Panel>
          ) : null}
          <MovementList title="Adjustment book" rows={adjustments} empty="No adjustments yet." />
        </div>
      ) : null}

      {tab === "waste" ? (
        <div className="grid items-start gap-5">
          <Panel title="Record waste" action={<span className="text-xs text-muted">Expired packs are listed first</span>}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#121a17] text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Pack</th>
                    <th className="px-3 py-2 font-medium">Expiry</th>
                    <th className="px-3 py-2 font-medium">On hand</th>
                    {canEdit ? <th className="px-3 py-2 font-medium">Write off</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {shelf.map((batch) => (
                    <tr key={batch.id} className="border-t border-line align-top">
                      <td className="px-3 py-3">
                        <span className="font-medium">{batch.medicine.name}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {batch.batchNumber}{batch.serialNumber ? ` · ${batch.serialNumber}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-3"><ExpiryText status={batch.expiryStatus} date={batch.expiryDate} days={batch.daysToExpiry} /></td>
                      <td className="px-3 py-3 tabular-nums">{batch.quantity}</td>
                      {canEdit ? (
                        <td className="px-3 py-3">
                          <form key={`${batch.id}-${batch.quantity}`} className="flex flex-wrap items-center gap-2" onSubmit={quietSubmit(recordWaste, setError)}>
                            <input type="hidden" name="batchId" value={batch.id} />
                            <input name="quantity" type="number" min="1" max={batch.quantity} defaultValue={batch.expiryStatus === "expired" ? batch.quantity : 1} className={`${control} w-20`} />
                            <select name="reason" defaultValue={batch.expiryStatus === "expired" ? "expired" : "damaged"} className={`${control} w-36`}>
                              {wasteReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <input name="note" placeholder="Note" className={`${control} w-36`} />
                            <button className="h-9 rounded-sm bg-[#8d332c] px-3 text-sm font-medium text-white">Waste</button>
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {shelf.length === 0 ? (
                    <tr><td className="px-3 py-8 text-muted" colSpan={canEdit ? 4 : 3}>The shelf is empty.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
          <MovementList title="Waste book" rows={waste} empty="Nothing has been written off." />
        </div>
      ) : null}
    </div>
  );
}

function ExpiryText({ status, date, days }: { status: string; date: string | null; days?: number }) {
  if (!date || status === "none") return <span className="text-muted">—</span>;
  const tone = status === "expired" ? "text-[#ffb4ab]" : status === "critical" ? "text-[#f3d7a1]" : status === "soon" ? "text-[#6b5b2e]" : "text-muted";
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
                {row.batch.batchNumber} · {labelReason(row.reason)}{row.note ? ` · ${row.note}` : ""}
              </span>
            </span>
            <span className="text-right">
              <span className={`block tabular-nums ${row.quantity < 0 ? "text-[#ffb4ab]" : "text-mossdeep"}`}>{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</span>
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
