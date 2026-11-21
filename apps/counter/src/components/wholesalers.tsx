"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, clock, lira, liraOf, money, paymentLabel, Session, when } from "@/lib/api";
import { AgedSupplier, WholesalerClosing } from "@/lib/types";
import { Field, Notice, Panel, PrimaryButton, control } from "./ui";

export function Wholesalers({ session }: { session: Session }) {
  const [suppliers, setSuppliers] = useState<AgedSupplier[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash_usd");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [closing, setClosing] = useState<WholesalerClosing | null>(null);
  const canPay = session.user.role === "owner" || session.user.role === "manager";
  const selected = suppliers.find((supplier) => supplier.id === selectedId) || null;

  async function load() {
    const [rows, till] = await Promise.all([
      api<AgedSupplier[]>("/pharmacy/suppliers/aged", session),
      api<{ llPerUsd: number }>("/pharmacy/till", session),
    ]);
    setSuppliers(rows);
    setRate(till.llPerUsd ? String(till.llPerUsd) : "");
    window.dispatchEvent(new Event("pharmacyos-badges"));
    return rows;
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load wholesaler credit"));
  }, [session]);

  function choose(supplier: AgedSupplier) {
    setSelectedId(supplier.id);
    setAmount((supplier.totalCents / 100).toFixed(2));
    setClosing(null);
    setError("");
  }

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 1) {
      setError("Enter the amount the pharmacy is paying.");
      return;
    }
    if (method === "cash_ll" && !(Number(rate) > 0)) {
      setError("Set how many lira equal one dollar.");
      return;
    }
    setPending(true);
    setError("");
    try {
      if (method === "cash_ll") {
        await api("/pharmacy/till", session, { method: "PATCH", body: JSON.stringify({ llPerUsd: Number(rate) }) });
      }
      const result = await api<{ closing: WholesalerClosing }>(`/pharmacy/suppliers/${selected.id}/payments`, session, {
        method: "POST",
        body: JSON.stringify({ method, amountCents: cents, note: note || undefined }),
      });
      setNote("");
      setClosing(result.closing);
      setAmount((result.closing.balanceCents / 100).toFixed(2));
      const rows = await load();
      if (!rows.some((supplier) => supplier.id === selected.id)) setSelectedId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment was not recorded");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Notice message={error} />
      <Panel title="Open invoices">
        {suppliers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No wholesaler has an open balance. Deliveries recorded against a supplier show up here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Wholesaler</th>
                  <th className="px-3 py-2 font-medium">Current</th>
                  <th className="px-3 py-2 font-medium">31–60 days</th>
                  <th className="px-3 py-2 font-medium">61–90 days</th>
                  <th className="px-3 py-2 font-medium">Over 90</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier.id}
                    onClick={() => choose(supplier)}
                    className={`cursor-pointer border-b border-line last:border-b-0 ${selectedId === supplier.id ? "bg-[#1a3329]" : "hover:bg-white/5"}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{supplier.name}</p>
                      <p className="text-xs text-muted">{supplier.phone || "No phone"}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{money(supplier.currentCents)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(supplier.days31Cents)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(supplier.days61Cents)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(supplier.days91Cents)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(supplier.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected ? (
        <Panel title={selected.name}>
          <ul>
            {selected.open.map((row) => (
              <li key={row.purchaseId} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{row.reference}</span>
                  <span className="ml-2 text-xs text-muted">{when(row.createdAt)} · {row.ageDays === 0 ? "today" : row.ageDays === 1 ? "1 day" : `${row.ageDays} days`}</span>
                </span>
                <span className="tabular-nums">{money(row.openCents)}</span>
              </li>
            ))}
          </ul>
          {canPay ? (
            <form onSubmit={pay} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
              <Field label="Amount paid, USD">
                <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className={control} />
              </Field>
              <Field label="How the pharmacy pays">
                <select value={method} onChange={(event) => setMethod(event.target.value)} className={control}>
                  <option value="cash_usd">Cash USD</option>
                  <option value="cash_ll">Cash LL</option>
                  <option value="card">Card</option>
                </select>
              </Field>
              {method === "cash_ll" ? (
                <Field label="Lira per dollar">
                  <input value={rate} inputMode="numeric" onChange={(event) => setRate(event.target.value.replace(/[^\d]/g, ""))} className={control} />
                  {Number(rate) > 0 && Number(amount) > 0 ? <span className="mt-1 block text-xs font-normal text-muted">Pay {lira(liraOf(Math.round(Number(amount) * 100), Number(rate)))} LL</span> : null}
                </Field>
              ) : null}
              <Field label="Note"><input value={note} onChange={(event) => setNote(event.target.value)} className={control} /></Field>
              <div className="sm:col-span-2">
                <PrimaryButton pending={pending}>Pay and print</PrimaryButton>
              </div>
            </form>
          ) : null}
        </Panel>
      ) : null}

      {closing ? <PaymentSheet closing={closing} pharmacy={session.user.tenant.name} onClose={() => setClosing(null)} /> : null}
    </div>
  );
}

function PaymentSheet({ closing, pharmacy, onClose }: { closing: WholesalerClosing; pharmacy: string; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 80);
    return () => window.clearTimeout(id);
  }, [closing.receiptNo]);

  return (
    <article className="print-sheet rounded-sm border border-line bg-surface px-5 py-5">
      <div className="no-print mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">Wholesaler payment</p>
        <div className="flex gap-2">
          <button className="h-8 rounded-sm bg-moss px-3 text-sm font-medium text-[#04281c]" onClick={() => window.print()}>Print</button>
          <button className="h-8 rounded-sm border border-line px-3 text-sm" onClick={onClose}>Close</button>
        </div>
      </div>
      <p className="text-xs font-medium text-muted">{pharmacy}</p>
      <h2 className="mt-1 text-lg font-semibold">{closing.receiptNo}</h2>
      <p className="mt-1 text-sm text-muted">{when(closing.createdAt)} · {clock(closing.createdAt)} · {closing.supplier.name}</p>
      <p className="mt-1 text-sm">{paymentLabel(closing.method)}{closing.llAmount ? ` · ${lira(closing.llAmount)} LL` : ""}</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {closing.lines.map((line) => (
          <li key={`${line.reference}-${line.amountCents}`} className="flex items-baseline justify-between gap-3 py-3 text-sm">
            <span>
              <span className="font-medium">{line.reference}</span>
              <span className="ml-2 text-muted">invoice closed · {when(line.createdAt)}</span>
            </span>
            <span className="tabular-nums">{money(line.amountCents)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span className="font-medium">Paid</span>
        <span className="text-base font-semibold tabular-nums">{money(closing.amountCents)}</span>
      </div>
      <p className="mt-1 text-sm text-muted">Still outstanding {money(closing.balanceCents)}</p>
      {closing.note ? <p className="mt-3 text-sm">{closing.note}</p> : null}
    </article>
  );
}
