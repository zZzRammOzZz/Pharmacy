"use client";

import { FormEvent, useState } from "react";
import { API_URL, encodeLicenseToken } from "@/lib/api";
import { Session } from "@/lib/api";
import { Field, Notice, control } from "./ui";

export function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("license");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose the license file issued for this pharmacy.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const license = JSON.parse(await file.text());
      const response = await fetch(`${API_URL}/pharmacy/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantCode: String(form.get("tenantCode") || "").trim().toLowerCase(),
          email: form.get("email"),
          password: form.get("password"),
          licenseToken: encodeLicenseToken(license),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
        throw new Error(message || "Could not sign in");
      }
      localStorage.setItem("pharmacyos_counter", JSON.stringify(body));
      onSuccess(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <form onSubmit={onSubmit} className="w-full max-w-[420px] rounded-sm border border-line bg-white p-6">
        <p className="text-xs font-medium text-muted">PharmacyOS</p>
        <h1 className="mt-1 text-lg font-semibold">Staff sign in</h1>
        <p className="mt-1 text-sm text-muted">Enter the pharmacy code, your staff account, and the license file for this site.</p>
        <div className="mt-5 grid gap-3">
          <Field label="Pharmacy code">
            <input name="tenantCode" required autoComplete="organization" className={control} placeholder="green-cross" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required autoComplete="username" className={control} placeholder="pharmacist@green-cross.local" />
          </Field>
          <Field label="Password">
            <input name="password" type="password" required autoComplete="current-password" className={control} />
          </Field>
          <Field label="License file">
            <input
              name="license"
              type="file"
              accept=".lic,application/json"
              required
              className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-sm file:border file:border-line file:bg-canvas file:px-3 file:text-sm file:text-ink"
              onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
            />
            <span className="mt-1 block text-xs text-muted">{fileName || "Use the .lic file issued for this pharmacy."}</span>
          </Field>
        </div>
        <div className="mt-3">
          <Notice message={error} />
        </div>
        <button className="mt-4 h-9 w-full rounded-sm bg-moss text-sm font-medium text-white hover:bg-[#0c5a40] disabled:bg-stone-300" disabled={pending}>
          {pending ? "Checking the license…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
