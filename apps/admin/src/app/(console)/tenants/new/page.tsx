"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewTenantPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const tenant = await api<{ id: string }>("/platform/tenants", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          code: String(form.get("code") || "").trim().toLowerCase(),
          email: form.get("email") || undefined,
          phone: form.get("phone") || undefined,
          address: form.get("address") || undefined,
          ownerName: form.get("ownerName"),
          ownerEmail: form.get("ownerEmail"),
          ownerPassword: form.get("ownerPassword"),
        }),
      });
      router.push(`/tenants/${tenant.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the pharmacy");
      setPending(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-xs uppercase tracking-[0.16em] text-stone-500">New tenant</p>
      <h1 className="mt-1 font-serif text-4xl">Open a pharmacy</h1>
      <p className="mt-3 text-sm text-stone-600">The owner can sign in on the counter once you issue a license on the next screen.</p>
      <form onSubmit={onSubmit} className="mt-6 grid gap-4 border border-line bg-white p-5 sm:grid-cols-2">
        <Field label="Pharmacy name" name="name" required />
        <Field label="Code" name="code" required placeholder="al-noor" />
        <Field label="Email" name="email" type="email" />
        <Field label="Phone" name="phone" />
        <label className="block text-sm sm:col-span-2">
          Address
          <input name="address" className="mt-1 w-full border border-line px-3 py-2" />
        </label>
        <Field label="Owner name" name="ownerName" required />
        <Field label="Owner email" name="ownerEmail" type="email" required />
        <Field label="Owner password" name="ownerPassword" type="password" required />
        {error ? <p className="text-sm text-[#8a3b32] sm:col-span-2">{error}</p> : null}
        <div className="sm:col-span-2">
          <button className="bg-moss px-4 py-2 text-sm text-white" disabled={pending}>
            {pending ? "Saving..." : "Create pharmacy"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, type = "text", required, placeholder }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="block text-sm">
      {label}
      <input name={name} type={type} required={required} placeholder={placeholder} className="mt-1 w-full border border-line px-3 py-2" />
    </label>
  );
}
