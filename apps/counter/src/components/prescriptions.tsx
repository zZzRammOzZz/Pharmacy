"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { api, Session, when } from "@/lib/api";
import { Medicine, Patient, Prescription } from "@/lib/types";
import { PaymentChoice } from "./payment";
import { Field, Notice, Panel, PrimaryButton, control, quietSubmit } from "./ui";

type DraftLine = { medicineId: string; quantity: number; dosage: string };
type Mode = "preview" | "edit" | "create";

export function Prescriptions({ session }: { session: Session }) {
  const [rows, setRows] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [method, setMethod] = useState("cash_usd");
  const [rate, setRate] = useState("");
  const canWrite = session.user.role === "owner" || session.user.role === "pharmacist";
  const selected = rows.find((row) => row.id === selectedId) || null;

  async function load() {
    const [scripts, people, meds] = await Promise.all([
      api<Prescription[]>("/pharmacy/prescriptions", session),
      api<Patient[]>("/pharmacy/patients", session),
      api<Medicine[]>("/pharmacy/medicines", session),
    ]);
    setRows(scripts);
    setPatients(people);
    setMedicines(meds);
    return scripts;
  }
  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
    api<{ llPerUsd: number }>("/pharmacy/till", session)
      .then((till) => setRate(till.llPerUsd ? String(till.llPerUsd) : ""))
      .catch(() => undefined);
  }, []);

  const visible = rows.filter((row) => (pendingOnly ? row.status === "pending" : true));

  function openPreview(prescription: Prescription) {
    setSelectedId(prescription.id);
    setMode("preview");
    setConfirmId(null);
    setError("");
  }

  function startEdit(prescription: Prescription) {
    setLines(prescription.items.map((item) => ({
      medicineId: item.medicine.id,
      quantity: item.quantity,
      dosage: item.dosage || "",
    })));
    setMode("edit");
    setError("");
  }

  function startCreate() {
    setSelectedId(null);
    setLines([]);
    setMode("create");
    setError("");
  }

  async function dispense(id: string) {
    if (method === "cash_ll" && (!Number.isInteger(Number(rate)) || Number(rate) < 1)) {
      setError("Set how many lira equal one dollar.");
      return;
    }
    setError("");
    if (method === "cash_ll") await api("/pharmacy/till", session, { method: "PATCH", body: JSON.stringify({ llPerUsd: Number(rate) }) });
    await api(`/pharmacy/prescriptions/${id}/dispense`, session, {
      method: "POST",
      body: JSON.stringify({ paymentMethod: method }),
    });
    setConfirmId(null);
    const scripts = await load();
    if (!scripts.some((row) => row.id === id && row.status === "pending")) setPendingOnly(false);
  }

  function addLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const medicineId = String(form.get("medicineId") || "");
    const quantity = Number(form.get("quantity") || 1);
    if (!medicineId) return;
    setLines((current) => [...current, { medicineId, quantity, dosage: String(form.get("dosage") || "") }]);
    event.currentTarget.reset();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) throw new Error("Add at least one medicine to the prescription.");
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const created = await api<Prescription>("/pharmacy/prescriptions", session, {
      method: "POST",
      body: JSON.stringify(scriptBody(form, lines)),
    });
    formEl.reset();
    setLines([]);
    setPendingOnly(true);
    await load();
    setSelectedId(created.id);
    setMode("preview");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (lines.length === 0) throw new Error("Add at least one medicine to the prescription.");
    const form = new FormData(event.currentTarget);
    await api(`/pharmacy/prescriptions/${selected.id}`, session, {
      method: "PATCH",
      body: JSON.stringify(scriptBody(form, lines)),
    });
    await load();
    setMode("preview");
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Notice message={error} />
          <div className="flex gap-2">
            <button className="h-9 border border-line bg-white px-3 text-sm" onClick={() => setPendingOnly((value) => !value)}>
              {pendingOnly ? "Show dispensed" : "Waiting only"}
            </button>
            {canWrite ? (
              <button className="h-9 border border-line bg-white px-3 text-sm" onClick={startCreate}>New prescription</button>
            ) : null}
          </div>
        </div>
        <div className="rounded-sm border border-line bg-white">
          {visible.length === 0 ? <p className="px-4 py-8 text-sm text-stone-500">The queue is clear.</p> : null}
          {visible.map((prescription) => (
            <button
              key={prescription.id}
              onClick={() => openPreview(prescription)}
              className={`block w-full border-b border-line px-4 py-4 text-left last:border-b-0 ${selectedId === prescription.id ? "bg-[#e7f3ee]" : "hover:bg-[#f6f8f7]"}`}
            >
              <p className="font-medium">{prescription.patient.name}</p>
              <p className="mt-1 text-sm text-stone-600">
                {prescription.doctorName || "Doctor not named"} · {when(prescription.createdAt)} · <span className="capitalize">{prescription.status}</span>
              </p>
              <ul className="mt-2 text-sm">
                {prescription.items.map((item, index) => (
                  <li key={`${prescription.id}-${index}`}>{lineText(item)}</li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </div>

      {selected && mode === "preview" ? (
        <ClientCopy prescription={selected} pharmacy={session.user.tenant.name}>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <button className="h-9 rounded-sm bg-moss px-3 text-sm font-medium text-white" onClick={() => window.print()}>Print for client</button>
            {selected.status === "pending" && canWrite ? (
              <button className="h-9 rounded-sm border border-line bg-white px-3 text-sm" onClick={() => startEdit(selected)}>Update</button>
            ) : null}
            {selected.status === "pending" && canWrite ? (
              confirmId === selected.id ? (
                <div className="w-full">
                  <PaymentChoice
                    method={method}
                    onMethod={setMethod}
                    rate={rate}
                    onRate={setRate}
                    totalCents={selected.items.reduce((sum, item) => sum + item.quantity * (medicines.find((row) => row.id === item.medicine.id)?.unitPriceCents || 0), 0)}
                    allowCredit
                  />
                  <div className="mt-3 flex gap-2">
                    <button className="h-9 rounded-sm bg-[#1c1917] px-3 text-sm text-white" onClick={() => dispense(selected.id).catch((err: Error) => setError(err.message))}>{method === "credit" ? "Charge to account" : "Confirm and sell"}</button>
                    <button className="h-9 rounded-sm border border-line px-3 text-sm" onClick={() => setConfirmId(null)}>Back</button>
                  </div>
                </div>
              ) : (
                <button className="h-9 rounded-sm border border-line px-3 text-sm" onClick={() => setConfirmId(selected.id)}>Dispense</button>
              )
            ) : null}
          </div>
        </ClientCopy>
      ) : null}

      {canWrite && mode === "edit" && selected ? (
        <ScriptForm
          title="Update prescription"
          patients={patients}
          medicines={medicines}
          lines={lines}
          setLines={setLines}
          patientId={selected.patient.id}
          doctorName={selected.doctorName || ""}
          notes={selected.notes || ""}
          submitLabel="Save prescription"
          onAddLine={addLine}
          onSubmit={quietSubmit(save, setError)}
          onCancel={() => setMode("preview")}
        />
      ) : null}

      {canWrite && mode === "create" ? (
        <ScriptForm
          title="New prescription"
          patients={patients}
          medicines={medicines}
          lines={lines}
          setLines={setLines}
          submitLabel="File prescription"
          onAddLine={addLine}
          onSubmit={quietSubmit(create, setError)}
        />
      ) : null}
    </div>
  );
}

function ClientCopy({
  prescription,
  pharmacy,
  children,
}: {
  prescription: Prescription;
  pharmacy: string;
  children?: ReactNode;
}) {
  return (
    <article className="client-copy rounded-sm border border-line bg-white px-5 py-5">
      <p className="text-xs font-medium text-muted">{pharmacy}</p>
      <h2 className="mt-1 text-lg font-semibold">For {prescription.patient.name}</h2>
      <p className="mt-1 text-sm text-stone-600">
        {when(prescription.createdAt)}
        {prescription.doctorName ? ` · ${prescription.doctorName}` : ""}
        {" · "}
        <span className="capitalize">{prescription.status}</span>
      </p>
      {prescription.patient.allergies ? (
        <p className="mt-3 rounded-sm border border-[#efd0cc] bg-[#fdf6f5] px-3 py-2 text-sm text-[#8d332c]">Allergy: {prescription.patient.allergies}</p>
      ) : null}
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {prescription.items.map((item, index) => (
          <li key={`${prescription.id}-${index}`} className="py-3 text-sm">
            <p className="font-medium">{item.medicine.name}{item.medicine.strength ? ` ${item.medicine.strength}` : ""}</p>
            <p className="mt-0.5 text-stone-600">Quantity {item.quantity}{item.dosage ? ` · ${item.dosage}` : ""}</p>
          </li>
        ))}
      </ul>
      {prescription.notes ? <p className="mt-3 text-sm text-stone-600">{prescription.notes}</p> : null}
      <p className="mt-4 text-xs text-muted">Keep this with the medicine.</p>
      {children}
    </article>
  );
}

function ScriptForm({
  title,
  patients,
  medicines,
  lines,
  setLines,
  patientId,
  doctorName,
  notes,
  submitLabel,
  onAddLine,
  onSubmit,
  onCancel,
}: {
  title: string;
  patients: Patient[];
  medicines: Medicine[];
  lines: DraftLine[];
  setLines: (lines: DraftLine[]) => void;
  patientId?: string;
  doctorName?: string;
  notes?: string;
  submitLabel: string;
  onAddLine: (event: FormEvent<HTMLFormElement>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  return (
    <Panel title={title}>
      <form onSubmit={onAddLine} className="grid gap-3 border-b border-line p-4">
        <Field label="Medicine">
          <select name="medicineId" required className={control} defaultValue="">
            <option value="">Select</option>
            {medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.inDate ?? medicine.onHand} in date</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><input name="quantity" type="number" min={1} defaultValue={1} className={control} /></Field>
          <Field label="Dosage"><input name="dosage" className={control} placeholder="1 three times daily" /></Field>
        </div>
        <button type="submit" className="h-9 border border-line text-sm">Add line</button>
      </form>
      <ul className="px-4 pt-3 text-sm">
        {lines.map((line, index) => {
          const medicine = medicines.find((item) => item.id === line.medicineId);
          return (
            <li key={`${line.medicineId}-${index}`} className="flex items-center justify-between gap-3 border-b border-line py-2">
              <span>{medicine?.name || "Medicine"} × {line.quantity}{line.dosage ? ` · ${line.dosage}` : ""}</span>
              <button type="button" className="text-xs text-muted" onClick={() => setLines(lines.filter((_, item) => item !== index))}>Remove</button>
            </li>
          );
        })}
        {lines.length === 0 ? <li className="py-2 text-stone-500">No medicines on this prescription yet.</li> : null}
      </ul>
      <form key={`${patientId || "new"}-${doctorName || ""}-${notes || ""}`} onSubmit={onSubmit} className="grid gap-3 p-4">
        <Field label="Client">
          <select name="patientId" required className={control} defaultValue={patientId || ""}>
            <option value="">Select</option>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
          </select>
        </Field>
        <Field label="Doctor"><input name="doctorName" className={control} defaultValue={doctorName || ""} /></Field>
        <Field label="Notes"><input name="notes" className={control} defaultValue={notes || ""} /></Field>
        <div className="flex gap-2">
          <PrimaryButton>{submitLabel}</PrimaryButton>
          {onCancel ? <button type="button" className="h-9 rounded-sm border border-line px-3 text-sm" onClick={onCancel}>Cancel</button> : null}
        </div>
      </form>
    </Panel>
  );
}

function scriptBody(form: FormData, lines: DraftLine[]) {
  return {
    patientId: form.get("patientId"),
    doctorName: String(form.get("doctorName") || "").trim() || undefined,
    notes: String(form.get("notes") || "").trim() || undefined,
    items: lines.map((line) => ({
      medicineId: line.medicineId,
      quantity: line.quantity,
      dosage: line.dosage || undefined,
    })),
  };
}

function lineText(item: Prescription["items"][number]) {
  return `${item.medicine.name}${item.medicine.strength ? ` ${item.medicine.strength}` : ""} × ${item.quantity}${item.dosage ? ` · ${item.dosage}` : ""}`;
}
