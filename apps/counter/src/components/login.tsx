"use client";

import { FormEvent, useState } from "react";
import { API_URL, encodeLicenseToken } from "@/lib/api";
import { Session } from "@/lib/api";
import { Notice } from "./ui";

export function Login({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("license");
    if (!(file instanceof File) || !file.name) {
      setError("Choose the license file issued for this pharmacy.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("That file was empty. Download the license again, then choose it from Files.");
      let license: unknown;
      try {
        license = JSON.parse(text);
      } catch {
        throw new Error("That file is not the pharmacy license.");
      }
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
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-[#07382c] text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div className="pointer-events-none absolute -left-24 top-16 h-72 w-72 rounded-full bg-[#1aa36f]/30 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-[#d7ffe9]/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl font-bold text-[#07382c]">+</span>
            <span className="text-sm font-semibold tracking-wide">PharmacyOS</span>
          </div>
          <h1 className="mt-16 max-w-md text-5xl font-semibold leading-[1.05] tracking-tight">The counter, ready for the day.</h1>
          <p className="mt-5 max-w-sm text-base leading-7 text-white/70">Sell, watch stock, and see each person’s reading without leaving the dispensary.</p>
        </div>
        <ul className="relative grid max-w-md gap-3">
          {[
            ["01", "Register", "Cash, lira, card, or on account"],
            ["02", "Stock", "Expiry and waste stay in view"],
            ["03", "Readings", "Yours, and the whole pharmacy"],
          ].map(([index, title, detail]) => (
            <li key={index} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
              <span className="text-xs font-semibold text-[#9dface]">{index}</span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-white/60">{detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex min-h-screen items-start justify-center bg-[#121a17] px-5 py-10 lg:items-center">
        <form onSubmit={onSubmit} className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#07382c] text-lg font-bold text-white">+</span>
            <span className="text-sm font-semibold">PharmacyOS</span>
          </div>
          <p className="text-sm font-semibold text-moss">Staff sign in</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-muted">Use the pharmacy code, your account, and the license file for this site.</p>

          <div className="mt-8 grid gap-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">Pharmacy code</span>
              <input name="tenantCode" required autoComplete="organization" placeholder="green-cross" className="h-12 w-full rounded-2xl border border-transparent bg-surface px-4 text-sm shadow-card outline-none focus:border-moss" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">Email</span>
              <input name="email" type="email" required autoComplete="username" placeholder="you@pharmacy.local" className="h-12 w-full rounded-2xl border border-transparent bg-surface px-4 text-sm shadow-card outline-none focus:border-moss" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted">Password</span>
              <input name="password" type="password" required autoComplete="current-password" className="h-12 w-full rounded-2xl border border-transparent bg-surface px-4 text-sm shadow-card outline-none focus:border-moss" />
            </label>
            <label className="relative block cursor-pointer rounded-2xl border border-dashed border-line bg-surface px-4 py-5 text-center shadow-card">
              <input
                name="license"
                type="file"
                required
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                onChange={(event) => setFileName(event.target.files?.[0]?.name || "")}
              />
              <span className="block text-sm font-semibold text-ink">{fileName || "Add the license file"}</span>
              <span className="mt-1 block text-xs text-muted">On iPhone, choose it from Files, in Downloads.</span>
            </label>
          </div>

          <div className="mt-4">
            <Notice message={error} />
          </div>
          <button className="mt-4 h-12 w-full rounded-2xl bg-moss text-sm font-semibold text-[#04281c] hover:bg-[#62d4a4] disabled:bg-[#2c3833] disabled:text-muted" disabled={pending}>
            {pending ? "Checking the license…" : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
