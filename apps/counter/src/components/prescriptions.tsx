"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Session, when } from "@/lib/api";
import { Medicine, Patient, Prescription } from "@/lib/types";
import { Field, Notice, Panel, PrimaryButton, control, quietSubmit } from "./ui";

type DraftLine = { medicineId: string; quantity: number; dosage: string };

export function Prescriptions({ session }: { session: Session }) {
  const [rows, setRows] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(true);
  const canWrite = session.user.role === "owner" || session.user.role === "pharmacist";

  async function load() {
    const [scripts, people, meds] = await Promise.all([
      api<Prescription[]>("/pharmacy/prescriptions", session),
      api<Patient[]>("/pharmacy/patients", session),
      api<Medicine[]>("/pharmacy/medicines", session),
    ]);
    setRows(scripts);
    setPatients(people);
    setMedicines(meds);
  }
  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
  }, []);

  const visible = rows.filter((row) => (pendingOnly ? row.status === "pending" : true));

  async function dispense(id: string) {
    setError("");
    await api(`/pharmacy/prescriptions/${id}/dispense`, session, { method: "POST" });
    setConfirmId(null);
    await load();
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
    if (lines.length === 0) {
      setError("Add at least one medicine to the prescription.");
      return;
    }
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    await api("/pharmacy/prescriptions", session, {
      method: "POST",
      body: JSON.stringify({
        patientId: form.get("patientId"),
        doctorName: form.get("doctorName") || undefined,
        notes: form.get("notes") || undefined,
        items: lines.map((line) => ({ medicineId: line.medicineId, quantity: line.quantity, dosage: line.dosage || undefined })),
      }),
    });
    formEl.reset();
    setLines([]);
    setPendingOnly(true);
    await load();
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <Notice message={error} />
          <button className="h-9 border border-line bg-white px-3 text-sm" onClick={() => setPendingOnly((value) => !value)}>
            {pendingOnly ? "Show dispensed" : "Waiting only"}
          </button>
        </div>
        <div className="rounded-sm border border-line bg-white">
          {visible.length === 0 ? <p className="px-4 py-8 text-sm text-stone-500">The queue is clear.</p> : null}
          {visible.map((prescription) => (
            <article key={prescription.id} className="border-b border-line px-4 py-4 last:border-b-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{prescription.patient.name}</p>
                  <p className="mt-1 text-sm text-stone-600">
                    {prescription.doctorName || "Doctor not named"} · {when(prescription.createdAt)} · <span className="capitalize">{prescription.status}</span>
                  </p>
                  <ul className="mt-2 text-sm">
                    {prescription.items.map((item, index) => (
                      <li key={`${prescription.id}-${index}`}>{item.medicine.name}{item.medicine.strength ? ` ${item.medicine.strength}` : ""} × {item.quantity}{item.dosage ? ` · ${item.dosage}` : ""}</li>
                    ))}
                  </ul>
                </div>
                {prescription.status === "pending" && canWrite ? (
                  confirmId === prescription.id ? (
                    <div className="flex gap-2">
                      <button className="h-9 bg-[#1c1917] px-3 text-sm text-white" onClick={() => dispense(prescription.id).catch((err: Error) => setError(err.message))}>Confirm and sell</button>
                      <button className="h-9 border border-line px-3 text-sm" onClick={() => setConfirmId(null)}>Back</button>
                    </div>
                  ) : (
                    <button className="h-9 border border-line px-3 text-sm" onClick={() => setConfirmId(prescription.id)}>Dispense</button>
                  )
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
      {canWrite ? (
        <Panel title="New prescription">
          <form onSubmit={addLine} className="grid gap-3 border-b border-line p-4">
            <Field label="Medicine">
              <select name="medicineId" required className={control}>
                <option value="">Select</option>
                {medicines.map((medicine) => <option key={medicine.id} value={medicine.id}>{medicine.name} · {medicine.onHand} on hand</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantity"><input name="quantity" type="number" min={1} defaultValue={1} className={control} /></Field>
              <Field label="Dosage"><input name="dosage" className={control} placeholder="1 three times daily" /></Field>
            </div>
            <button type="submit" className="h-10 border border-line text-sm">Add line</button>
          </form>
          <ul className="px-4 pt-3 text-sm">
            {lines.map((line, index) => {
              const medicine = medicines.find((item) => item.id === line.medicineId);
              return <li key={`${line.medicineId}-${index}`} className="border-b border-line py-2">{medicine?.name || "Medicine"} × {line.quantity}{line.dosage ? ` · ${line.dosage}` : ""}</li>;
            })}
          </ul>
          <form onSubmit={quietSubmit(create, setError)} className="grid gap-3 p-4">
            <Field label="Patient">
              <select name="patientId" required className={control}>
                <option value="">Select</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
              </select>
            </Field>
            <Field label="Doctor"><input name="doctorName" className={control} /></Field>
            <Field label="Notes"><input name="notes" className={control} /></Field>
            <PrimaryButton>File prescription</PrimaryButton>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
