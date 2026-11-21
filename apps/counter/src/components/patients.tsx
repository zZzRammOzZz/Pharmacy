"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { allowed, api, lira, liraOf, money, paymentLabel, Session, when } from "@/lib/api";
import { ClientProfile, Medicine, Patient, Sale } from "@/lib/types";
import { ReceiptSheet, saleBalance, saleMarks } from "./receipt";
import { Field, Notice, Panel, PrimaryButton, control, quietSubmit } from "./ui";

const sexes = [
  ["", "Not recorded"],
  ["female", "Female"],
  ["male", "Male"],
  ["unspecified", "Unspecified"],
] as const;

export function Patients({ session }: { session: Session }) {
  const [rows, setRows] = useState<Patient[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [payMethod, setPayMethod] = useState("cash_usd");
  const [rate, setRate] = useState("");
  const [amount, setAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const scripts = session.license.features.includes("prescriptions");

  async function loadList() {
    const people = await api<Patient[]>("/pharmacy/patients", session);
    setRows(people);
    return people;
  }

  async function open(id: string) {
    setSelected(id);
    setEditing(false);
    setReceipt(null);
    setProfile(await api<ClientProfile>(`/pharmacy/patients/${id}`, session));
  }

  useEffect(() => {
    loadList()
      .then((people) => {
        if (people[0]) return open(people[0].id);
      })
      .catch((err: Error) => setError(err.message));
    api<{ llPerUsd: number }>("/pharmacy/till", session)
      .then((till) => setRate(till.llPerUsd ? String(till.llPerUsd) : ""))
      .catch(() => undefined);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((patient) =>
      `${patient.name} ${patient.phone || ""} ${patient.nationalId || ""} ${patient.allergies || ""}`.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError("");
    const created = await api<Patient>("/pharmacy/patients", session, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        phone: value(form, "phone"),
        sex: value(form, "sex"),
        dateOfBirth: value(form, "dateOfBirth"),
        nationalId: value(form, "nationalId"),
        address: value(form, "address"),
        allergies: value(form, "allergies"),
        notes: value(form, "notes"),
      }),
    });
    formEl.reset();
    await loadList();
    await open(created.id);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError("");
    await api(`/pharmacy/patients/${profile.id}`, session, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.get("name"),
        phone: value(form, "phone"),
        sex: value(form, "sex"),
        dateOfBirth: value(form, "dateOfBirth"),
        nationalId: value(form, "nationalId"),
        address: value(form, "address"),
        allergies: value(form, "allergies"),
        notes: value(form, "notes"),
      }),
    });
    await loadList();
    await open(profile.id);
  }

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 1) {
      setError("Enter the amount received.");
      return;
    }
    if (payMethod === "cash_ll" && (!Number.isInteger(Number(rate)) || Number(rate) < 1)) {
      setError("Set how many lira equal one dollar.");
      return;
    }
    setPaying(true);
    setError("");
    try {
      if (payMethod === "cash_ll") {
        await api("/pharmacy/till", session, { method: "PATCH", body: JSON.stringify({ llPerUsd: Number(rate) }) });
      }
      const next = await api<ClientProfile>(`/pharmacy/patients/${profile.id}/payments`, session, {
        method: "POST",
        body: JSON.stringify({ method: payMethod, amountCents: cents, note: payNote || undefined }),
      });
      setProfile(next);
      setAmount("");
      setPayNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment did not complete");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <Notice message={error} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, or ID" className={`${control} mb-3`} />
        <div className="rounded-sm border border-line bg-surface">
          {visible.length === 0 ? <p className="px-4 py-8 text-sm text-muted">No clients match.</p> : null}
          {visible.map((patient) => (
            <button
              key={patient.id}
              onClick={() => open(patient.id).catch((err: Error) => setError(err.message))}
              className={`flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left text-sm last:border-b-0 ${selected === patient.id ? "bg-[#1a3329]" : "hover:bg-white/5"}`}
            >
              <span>
                <span className="font-medium">{patient.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{patient.phone || "No phone"}</span>
              </span>
              {patient.allergies ? <span className="shrink-0 rounded-sm bg-[#3a201c] px-1.5 py-0.5 text-[11px] font-medium text-[#ffb4ab]">Allergy</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        {profile && selected === profile.id ? (
          <Panel
            title={profile.name}
            action={
              <button className="text-xs font-medium text-moss" onClick={() => setEditing((value) => !value)}>
                {editing ? "Close" : "Edit profile"}
              </button>
            }
          >
            {profile.allergies ? (
              <p className="border-b border-[#efd0cc] bg-[#2a1715] px-4 py-2 text-sm text-[#ffb4ab]">Allergy: {profile.allergies}</p>
            ) : null}
            {editing ? (
              <form key={profile.id} onSubmit={quietSubmit(save, setError)} className="grid gap-3 p-4 sm:grid-cols-2">
                <Field label="Full name"><input name="name" required defaultValue={profile.name} className={control} /></Field>
                <Field label="Phone"><input name="phone" defaultValue={profile.phone || ""} className={control} /></Field>
                <Field label="Sex">
                  <select name="sex" defaultValue={profile.sex || ""} className={control}>
                    {sexes.map(([id, label]) => <option key={id || "none"} value={id}>{label}</option>)}
                  </select>
                </Field>
                <Field label="Date of birth"><input name="dateOfBirth" type="date" defaultValue={dateInput(profile.dateOfBirth)} className={control} /></Field>
                <Field label="ID number"><input name="nationalId" defaultValue={profile.nationalId || ""} className={control} /></Field>
                <Field label="Address"><input name="address" defaultValue={profile.address || ""} className={control} /></Field>
                <Field label="Allergies"><input name="allergies" defaultValue={profile.allergies || ""} className={control} /></Field>
                <Field label="Notes"><input name="notes" defaultValue={profile.notes || ""} className={control} /></Field>
                <div className="sm:col-span-2"><PrimaryButton>Save profile</PrimaryButton></div>
              </form>
            ) : (
              <dl className="grid gap-4 p-4 text-sm sm:grid-cols-2">
                <Fact label="Phone" value={profile.phone} />
                <Fact label="Sex" value={sexes.find((item) => item[0] === profile.sex)?.[1] || null} />
                <Fact label="Date of birth" value={profile.dateOfBirth ? `${when(profile.dateOfBirth)} · ${years(profile.dateOfBirth)} years` : null} />
                <Fact label="ID number" value={profile.nationalId} />
                <Fact label="Address" value={profile.address} />
                <Fact label="On file since" value={when(profile.createdAt)} />
                <div className="sm:col-span-2"><Fact label="Notes" value={profile.notes} /></div>
                <div><Fact label="Receipts" value={String(profile.saleCount)} /></div>
                <div><Fact label="Paid" value={money(profile.spentCents)} /></div>
                <div><Fact label={profile.owedCents < 0 ? "In credit" : "On account"} value={money(Math.abs(profile.owedCents || 0))} /></div>
              </dl>
            )}
          </Panel>
        ) : (
          <p className="text-sm text-muted">Select a client to open the profile.</p>
        )}
        {profile && !editing ? (
          <Panel title="Account">
            {profile.owedCents > 0 ? (
              <form onSubmit={receive} className="grid gap-3 border-b border-line p-4 sm:grid-cols-2">
                <Field label="Amount received, USD">
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className={control} placeholder="0.00" />
                </Field>
                <Field label="How they pay">
                  <select value={payMethod} onChange={(event) => setPayMethod(event.target.value)} className={control}>
                    <option value="cash_usd">Cash USD</option>
                    <option value="cash_ll">Cash LL</option>
                    <option value="card">Card</option>
                  </select>
                </Field>
                {payMethod === "cash_ll" ? (
                  <Field label="Lira per dollar">
                    <input value={rate} inputMode="numeric" onChange={(event) => setRate(event.target.value.replace(/[^\d]/g, ""))} className={control} placeholder="89500" />
                    {Number(rate) > 0 && Number(amount) > 0 ? <span className="mt-1 block text-xs font-normal text-muted">Collect {lira(liraOf(Math.round(Number(amount) * 100), Number(rate)))} LL</span> : null}
                  </Field>
                ) : null}
                <Field label="Note"><input value={payNote} onChange={(event) => setPayNote(event.target.value)} className={control} /></Field>
                <div className="sm:col-span-2"><PrimaryButton pending={paying}>Receive on account</PrimaryButton></div>
              </form>
            ) : (
              <p className="border-b border-line px-4 py-3 text-sm text-muted">{profile.owedCents < 0 ? "This client has money in credit." : "Nothing is owed on account."}</p>
            )}
            <ul>
              {(profile.payments || []).map((payment) => (
                <li key={payment.id} className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0">
                  <span>
                    <span className="font-medium">{payment.receiptNo ? `${payment.receiptNo} · ` : ""}{paymentLabel(payment.method)}</span>
                    <span className="ml-2 text-xs text-muted">{when(payment.createdAt)}{payment.note ? ` · ${payment.note}` : ""}{payment.llAmount ? ` · ${lira(payment.llAmount)} LL` : ""}</span>
                  </span>
                  <span className="tabular-nums">{money(payment.amountCents)}</span>
                </li>
              ))}
              {(profile.payments || []).length === 0 ? <li className="px-4 py-4 text-sm text-muted">No payments against the account yet.</li> : null}
            </ul>
          </Panel>
        ) : null}
        {profile && receipt && !editing ? (
          <ReceiptSheet
            session={session}
            sale={receipt}
            pharmacy={session.user.tenant.name}
            medicines={medicines}
            clientName={profile.name}
            canRefund={allowed(session, "refund")}
            onClose={() => setReceipt(null)}
            onChange={async (sale) => {
              setReceipt(sale);
              const [next, meds] = await Promise.all([
                api<ClientProfile>(`/pharmacy/patients/${profile.id}`, session),
                api<Medicine[]>("/pharmacy/medicines", session),
              ]);
              setProfile(next);
              setMedicines(meds);
              setReceipt(next.sales.find((row) => row.id === sale.id) || sale);
            }}
          />
        ) : null}
        {profile && !editing ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Receipts">
              <ul>
                {profile.sales.map((sale) => (
                  <li key={sale.id} className="border-b border-line last:border-b-0">
                    <button
                      className={`block w-full px-4 py-3 text-left text-sm ${receipt?.id === sale.id ? "bg-[#1a3329]" : "hover:bg-white/5"}`}
                      onClick={() => {
                        setReceipt(sale);
                        if (medicines.length === 0) {
                          api<Medicine[]>("/pharmacy/medicines", session).then(setMedicines).catch((err: Error) => setError(err.message));
                        }
                      }}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="font-medium">{sale.receiptNo}</span>
                        <span className="tabular-nums">{money(saleBalance(sale))}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {when(sale.createdAt)} · {paymentLabel(sale.paymentMethod)} · {sale.items.map((item) => `${item.medicine.name} × ${item.quantity}`).join(", ")}
                        {saleMarks(sale).map((mark) => <span key={mark} className="ml-2 font-medium text-[#ffb4ab]">{mark}</span>)}
                      </span>
                    </button>
                  </li>
                ))}
                {profile.sales.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No receipts on this profile.</li> : null}
              </ul>
            </Panel>
            {scripts ? (
              <Panel title="Prescriptions">
                <ul>
                  {profile.prescriptions.map((script) => (
                    <li key={script.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{script.doctorName || "No doctor named"}</span>
                        <span className="capitalize text-xs text-muted">{script.status}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {when(script.createdAt)} · {script.items.map((item) => `${item.medicine.name} × ${item.quantity}`).join(", ")}
                      </p>
                    </li>
                  ))}
                  {profile.prescriptions.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No prescriptions on this profile.</li> : null}
                </ul>
              </Panel>
            ) : null}
          </div>
        ) : null}
        <Panel title="New client">
          <form onSubmit={quietSubmit(create, setError)} className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Full name"><input name="name" required className={control} /></Field>
            <Field label="Phone"><input name="phone" className={control} /></Field>
            <Field label="Sex">
              <select name="sex" defaultValue="" className={control}>
                {sexes.map(([id, label]) => <option key={id || "none"} value={id}>{label}</option>)}
              </select>
            </Field>
            <Field label="Date of birth"><input name="dateOfBirth" type="date" className={control} /></Field>
            <Field label="ID number"><input name="nationalId" className={control} /></Field>
            <Field label="Address"><input name="address" className={control} /></Field>
            <Field label="Allergies"><input name="allergies" className={control} placeholder="None recorded" /></Field>
            <Field label="Notes"><input name="notes" className={control} /></Field>
            <div className="sm:col-span-2"><PrimaryButton>Save client</PrimaryButton></div>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{value || "Not recorded"}</dd>
    </div>
  );
}

function value(form: FormData, name: string) {
  const text = String(form.get(name) || "").trim();
  return text || null;
}

function dateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function years(value: string) {
  const born = new Date(value);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const beforeBirthday = now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
