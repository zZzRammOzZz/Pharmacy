"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { StatusPill } from "@/components/shell";
import { api, downloadLicense, License, when } from "@/lib/api";

type Tenant = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  users: { id: string; name: string; email: string; role: string }[];
  counts: { medicines: number; patients: number; sales: number };
  licenses: License[];
};

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const row = await api<Tenant>(`/platform/tenants/${params.id}`);
    setTenant(row);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [params.id]);

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setMessage("");
    try {
      await api(`/platform/tenants/${params.id}/licenses`, {
        method: "POST",
        body: JSON.stringify({
          plan: form.get("plan"),
          termMonths: Number(form.get("termMonths") || 12),
          seats: Number(form.get("seats") || 0) || undefined,
        }),
      });
      setMessage("License issued. Download the file and give it to the pharmacy with the counter app.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not issue the license");
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this license? The pharmacy counter will stop accepting it.")) return;
    await api(`/platform/licenses/${id}/revoke`, { method: "POST" });
    await load();
  }

  async function setStatus(status: "active" | "suspended") {
    await api(`/platform/tenants/${params.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  if (!tenant) return <p className="text-sm text-stone-500">{error || "Loading pharmacy..."}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-stone-500">{tenant.code}</p>
          <h1 className="mt-1 font-serif text-4xl">{tenant.name}</h1>
          <p className="mt-2 text-sm text-stone-600">{[tenant.address, tenant.phone, tenant.email].filter(Boolean).join(" · ") || "No contact details"}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={tenant.status} />
          {tenant.status === "active" ? (
            <button className="border border-line px-3 py-1.5 text-sm" onClick={() => setStatus("suspended")}>Suspend</button>
          ) : (
            <button className="border border-line px-3 py-1.5 text-sm" onClick={() => setStatus("active")}>Reactivate</button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Mini label="Medicines" value={tenant.counts.medicines} />
        <Mini label="Patients" value={tenant.counts.patients} />
        <Mini label="Sales" value={tenant.counts.sales} />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-line bg-white">
          <h2 className="border-b border-line px-4 py-3 font-medium">Licenses</h2>
          <div className="divide-y divide-line">
            {tenant.licenses.length === 0 ? <p className="px-4 py-6 text-sm text-stone-500">No license issued yet.</p> : null}
            {tenant.licenses.map((license) => (
              <article key={license.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium capitalize">{license.plan} · {license.seats} seats</p>
                    <p className="mt-1 text-xs text-stone-500">{license.keyId}</p>
                    <p className="mt-1 text-sm text-stone-600">{when(license.issuedAt)} to {when(license.expiresAt)}</p>
                  </div>
                  <StatusPill status={license.status} />
                </div>
                <p className="mt-2 text-xs text-stone-500">{license.features.join(", ")}</p>
                <div className="mt-3 flex gap-2">
                  <button className="bg-moss px-3 py-1.5 text-sm text-white" onClick={() => downloadLicense(license.id).catch((err) => setError(err.message))}>
                    Download .lic
                  </button>
                  {license.status === "active" ? (
                    <button className="border border-line px-3 py-1.5 text-sm" onClick={() => revoke(license.id)}>Revoke</button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
        <form onSubmit={issue} className="border border-line bg-white p-4">
          <h2 className="font-medium">Issue a license</h2>
          <p className="mt-1 text-sm text-stone-600">A year is the default. The file is signed, so the counter can check it even before it calls home.</p>
          <label className="mt-4 block text-sm">
            Plan
            <select name="plan" className="mt-1 w-full border border-line px-3 py-2" defaultValue="standard">
              <option value="standard">Standard — stock, sales, patients, 5 seats</option>
              <option value="professional">Professional — adds prescriptions and suppliers, 15 seats</option>
            </select>
          </label>
          <label className="mt-4 block text-sm">
            Term in months
            <input name="termMonths" type="number" min={1} max={36} defaultValue={12} className="mt-1 w-full border border-line px-3 py-2" />
          </label>
          <label className="mt-4 block text-sm">
            Seats
            <input name="seats" type="number" min={1} max={500} placeholder="Plan default" className="mt-1 w-full border border-line px-3 py-2" />
          </label>
          {message ? <p className="mt-3 text-sm text-mossdeep">{message}</p> : null}
          {error ? <p className="mt-3 text-sm text-[#8a3b32]">{error}</p> : null}
          <button className="mt-4 bg-ink px-4 py-2 text-sm text-white">Issue license</button>
        </form>
      </section>

      <section className="mt-6 border border-line bg-white">
        <h2 className="border-b border-line px-4 py-3 font-medium">Staff</h2>
        <ul className="divide-y divide-line text-sm">
          {tenant.users.map((user) => (
            <li key={user.id} className="flex justify-between px-4 py-3">
              <span>{user.name}<span className="ml-2 text-stone-500">{user.email}</span></span>
              <span className="capitalize text-stone-600">{user.role}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-line bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-1 font-serif text-2xl">{value}</p>
    </div>
  );
}
