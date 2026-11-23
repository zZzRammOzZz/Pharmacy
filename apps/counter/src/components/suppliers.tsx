"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { allowed, api, money, Session, when } from "@/lib/api";
import { Supplier, SupplierProfile } from "@/lib/types";
import { Dialog, Field, Notice, Panel, PrimaryButton, control, newButton, quietSubmit } from "./ui";

export function Suppliers({ session }: { session: Session }) {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [profile, setProfile] = useState<SupplierProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const canEdit = allowed(session, "suppliers");

  async function loadList() {
    const suppliers = await api<Supplier[]>("/pharmacy/suppliers", session);
    setRows(suppliers);
    return suppliers;
  }

  async function open(id: string) {
    setSelected(id);
    setEditing(false);
    setProfile(await api<SupplierProfile>(`/pharmacy/suppliers/${id}`, session));
  }

  useEffect(() => {
    loadList()
      .then((suppliers) => {
        if (suppliers[0]) return open(suppliers[0].id);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((supplier) =>
      `${supplier.name} ${supplier.contactName || ""} ${supplier.phone || ""} ${supplier.email || ""}`.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    setError("");
    const created = await api<Supplier>("/pharmacy/suppliers", session, {
      method: "POST",
      body: JSON.stringify(payload(form)),
    });
    formEl.reset();
    setCreating(false);
    await loadList();
    await open(created.id);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = new FormData(event.currentTarget);
    setError("");
    await api(`/pharmacy/suppliers/${profile.id}`, session, {
      method: "PATCH",
      body: JSON.stringify({ ...payload(form), name: form.get("name") }),
    });
    await loadList();
    await open(profile.id);
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div>
        <Notice message={error} />
        <div className="mb-3 flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, contact, or phone" className={control} />
          {canEdit ? <button type="button" className={newButton} onClick={() => { setCreating(true); setError(""); }}>New</button> : null}
        </div>
        <div className="rounded-sm border border-line bg-surface">
          {visible.length === 0 ? <p className="px-4 py-8 text-sm text-muted">No suppliers on file.</p> : null}
          {visible.map((supplier) => (
            <button
              key={supplier.id}
              onClick={() => open(supplier.id).catch((err: Error) => setError(err.message))}
              className={`block w-full border-b border-line px-4 py-3 text-left text-sm last:border-b-0 ${selected === supplier.id ? "bg-[#1a3329]" : "hover:bg-white/5"}`}
            >
              <span className="font-medium">{supplier.name}</span>
              <span className="mt-0.5 block text-xs text-muted">{supplier.contactName || supplier.phone || "No contact"}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        {profile && selected === profile.id ? (
          <Panel
            title={profile.name}
            action={
              canEdit ? (
                <button className="text-xs font-medium text-moss" onClick={() => setEditing((value) => !value)}>
                  {editing ? "Close" : "Edit profile"}
                </button>
              ) : null
            }
          >
            {editing ? (
              <ProfileForm profile={profile} onSubmit={quietSubmit(save, setError)} />
            ) : (
              <dl className="grid gap-4 p-4 text-sm sm:grid-cols-2">
                <Fact label="Contact" value={profile.contactName} />
                <Fact label="Phone" value={profile.phone} />
                <Fact label="Email" value={profile.email} />
                <Fact label="Tax number" value={profile.taxNumber} />
                <Fact label="Payment terms" value={profile.paymentTerms} />
                <Fact label="On file since" value={when(profile.createdAt)} />
                <div className="sm:col-span-2"><Fact label="Address" value={profile.address} /></div>
                <div className="sm:col-span-2"><Fact label="Notes" value={profile.notes} /></div>
                <Fact label="Invoices" value={String(profile.purchaseCount)} />
                <Fact label="Outstanding" value={money(profile.owedCents || 0)} />
              </dl>
            )}
          </Panel>
        ) : (
          <p className="text-sm text-muted">Select a supplier to open the profile.</p>
        )}
        {profile && !editing ? (
          <Panel title="Goods received">
            <ul>
              {profile.purchases.map((purchase) => (
                <li key={purchase.id} className="border-b border-line px-4 py-3 text-sm last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{purchase.reference}</span>
                    <span className="text-right text-xs text-muted">
                      {when(purchase.createdAt)}
                      <span className="mt-0.5 block text-sm font-medium text-ink">{money(purchase.lines.reduce((sum, line) => sum + line.quantity * line.costCents, 0))}</span>
                    </span>
                  </div>
                  {purchase.lines.map((line) => (
                    <p key={line.id} className="mt-1 text-xs text-muted">
                      {line.medicine.name} · {line.batchNumber} · {line.quantity} · exp {when(line.expiryDate)}
                    </p>
                  ))}
                </li>
              ))}
              {profile.purchases.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No invoices from this supplier yet.</li> : null}
            </ul>
          </Panel>
        ) : null}
        {creating ? (
          <Dialog title="New supplier" onClose={() => setCreating(false)}>
            <form onSubmit={quietSubmit(create, setError)} className="grid gap-3 p-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Notice message={error} /></div>
              <Field label="Company"><input name="name" required className={control} /></Field>
              <Field label="Contact person"><input name="contactName" className={control} /></Field>
              <Field label="Phone"><input name="phone" className={control} /></Field>
              <Field label="Email"><input name="email" type="email" className={control} /></Field>
              <Field label="Tax number"><input name="taxNumber" className={control} /></Field>
              <Field label="Payment terms"><input name="paymentTerms" className={control} placeholder="30 days" /></Field>
              <div className="sm:col-span-2"><Field label="Address"><input name="address" className={control} /></Field></div>
              <div className="sm:col-span-2"><Field label="Notes"><input name="notes" className={control} /></Field></div>
              <div className="sm:col-span-2"><PrimaryButton>Save supplier</PrimaryButton></div>
            </form>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}

function ProfileForm({ profile, onSubmit }: { profile: Supplier; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form key={profile.id} onSubmit={onSubmit} className="grid gap-3 p-4 sm:grid-cols-2">
      <Field label="Company"><input name="name" required defaultValue={profile.name} className={control} /></Field>
      <Field label="Contact person"><input name="contactName" defaultValue={profile.contactName || ""} className={control} /></Field>
      <Field label="Phone"><input name="phone" defaultValue={profile.phone || ""} className={control} /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={profile.email || ""} className={control} /></Field>
      <Field label="Tax number"><input name="taxNumber" defaultValue={profile.taxNumber || ""} className={control} /></Field>
      <Field label="Payment terms"><input name="paymentTerms" defaultValue={profile.paymentTerms || ""} className={control} /></Field>
      <div className="sm:col-span-2"><Field label="Address"><input name="address" defaultValue={profile.address || ""} className={control} /></Field></div>
      <div className="sm:col-span-2"><Field label="Notes"><input name="notes" defaultValue={profile.notes || ""} className={control} /></Field></div>
      <div className="sm:col-span-2"><PrimaryButton>Save profile</PrimaryButton></div>
    </form>
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

function payload(form: FormData) {
  const text = (name: string) => {
    const value = String(form.get(name) || "").trim();
    return value || null;
  };
  return {
    name: form.get("name"),
    contactName: text("contactName"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    taxNumber: text("taxNumber"),
    paymentTerms: text("paymentTerms"),
    notes: text("notes"),
  };
}
