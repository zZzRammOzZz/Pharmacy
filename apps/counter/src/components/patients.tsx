"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, money, Session, when } from "@/lib/api";
import { ClientProfile, Patient } from "@/lib/types";
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
    setProfile(await api<ClientProfile>(`/pharmacy/patients/${id}`, session));
  }

  useEffect(() => {
    loadList()
      .then((people) => {
        if (people[0]) return open(people[0].id);
      })
      .catch((err: Error) => setError(err.message));
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

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <Notice message={error} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, or ID" className={`${control} mb-3`} />
        <div className="rounded-sm border border-line bg-white">
          {visible.length === 0 ? <p className="px-4 py-8 text-sm text-stone-500">No clients match.</p> : null}
          {visible.map((patient) => (
            <button
              key={patient.id}
              onClick={() => open(patient.id).catch((err: Error) => setError(err.message))}
              className={`flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left text-sm last:border-b-0 ${selected === patient.id ? "bg-[#e7f3ee]" : "hover:bg-[#f6f8f7]"}`}
            >
              <span>
                <span className="font-medium">{patient.name}</span>
                <span className="mt-0.5 block text-xs text-stone-500">{patient.phone || "No phone"}</span>
              </span>
              {patient.allergies ? <span className="shrink-0 rounded-sm bg-[#f8e8e6] px-1.5 py-0.5 text-[11px] font-medium text-[#8d332c]">Allergy</span> : null}
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
              <p className="border-b border-[#efd0cc] bg-[#fdf6f5] px-4 py-2 text-sm text-[#8d332c]">Allergy: {profile.allergies}</p>
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
                <div><Fact label="Spent" value={money(profile.spentCents)} /></div>
              </dl>
            )}
          </Panel>
        ) : (
          <p className="text-sm text-stone-500">Select a client to open the profile.</p>
        )}
        {profile && !editing ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Purchases">
              <ul>
                {profile.sales.map((sale) => (
                  <li key={sale.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{sale.receiptNo}</span>
                      <span className="tabular-nums">{money(sale.totalCents)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-stone-500">
                      {when(sale.createdAt)} · {sale.items.map((item) => `${item.medicine.name} × ${item.quantity}`).join(", ")}
                    </p>
                  </li>
                ))}
                {profile.sales.length === 0 ? <li className="px-4 py-6 text-sm text-stone-500">No receipts on this profile.</li> : null}
              </ul>
            </Panel>
            {scripts ? (
              <Panel title="Prescriptions">
                <ul>
                  {profile.prescriptions.map((script) => (
                    <li key={script.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{script.doctorName || "No doctor named"}</span>
                        <span className="capitalize text-xs text-stone-500">{script.status}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {when(script.createdAt)} · {script.items.map((item) => `${item.medicine.name} × ${item.quantity}`).join(", ")}
                      </p>
                    </li>
                  ))}
                  {profile.prescriptions.length === 0 ? <li className="px-4 py-6 text-sm text-stone-500">No prescriptions on this profile.</li> : null}
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
