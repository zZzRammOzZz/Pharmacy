"use client";

import { FormEvent, useEffect, useState } from "react";
import { allowed, api, clock, lira, liraOf, money, paymentLabel, Session, when } from "@/lib/api";
import { AgedClient, ClientProfile, ClosingReceipt, Medicine, Sale } from "@/lib/types";
import { ReceiptSheet } from "./receipt";
import { Field, Notice, Panel, PrimaryButton, control } from "./ui";

export function Aged({ session }: { session: Session }) {
  const [clients, setClients] = useState<AgedClient[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash_usd");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [closing, setClosing] = useState<ClosingReceipt | null>(null);
  const [sale, setSale] = useState<Sale | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  const selected = clients.find((client) => client.id === selectedId) || null;

  async function load() {
    const [rows, till, stock] = await Promise.all([
      api<AgedClient[]>("/pharmacy/aged", session),
      api<{ llPerUsd: number }>("/pharmacy/till", session),
      api<Medicine[]>("/pharmacy/medicines", session),
    ]);
    setClients(rows);
    setRate(till.llPerUsd ? String(till.llPerUsd) : "");
    setMedicines(stock);
    window.dispatchEvent(new Event("pharmacyos-badges"));
    return rows;
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load open credit"));
  }, [session]);

  function choose(client: AgedClient) {
    setSelectedId(client.id);
    setAmount((client.totalCents / 100).toFixed(2));
    setClosing(null);
    setSale(null);
    setError("");
  }

  async function openReceipt(saleId: string) {
    setError("");
    const next = await api<Sale>(`/pharmacy/sales/${saleId}`, session);
    setSale(next);
  }

  async function closeBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < 1) {
      setError("Enter the amount they are paying.");
      return;
    }
    if (method === "cash_ll" && !(Number(rate) > 0)) {
      setError("Set the lira rate in Settings before taking lira.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await api<ClientProfile & { closing: ClosingReceipt }>(`/pharmacy/patients/${selected.id}/payments`, session, {
        method: "POST",
        body: JSON.stringify({ method, amountCents: cents, note: note || undefined }),
      });
      setNote("");
      setClosing(result.closing);
      setAmount((result.closing.balanceCents / 100).toFixed(2));
      const rows = await load();
      if (!rows.some((client) => client.id === selected.id)) setSelectedId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The balance was not closed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Notice message={error} />
      <Panel title="Open credit">
        {clients.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">No client has an open balance.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Current</th>
                  <th className="px-3 py-2 font-medium">31–60 days</th>
                  <th className="px-3 py-2 font-medium">61–90 days</th>
                  <th className="px-3 py-2 font-medium">Over 90</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => choose(client)}
                    className={`cursor-pointer border-b border-line last:border-b-0 ${selectedId === client.id ? "bg-[#1a3329]" : "hover:bg-white/5"}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{client.name}</p>
                      <p className="text-xs text-muted">{client.phone || "No phone"}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{money(client.currentCents)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(client.days31Cents)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(client.days61Cents)}</td>
                    <td className="px-3 py-3 tabular-nums">{money(client.days91Cents)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(client.totalCents)}</td>
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
              <li key={row.saleId} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm">
                <span>
                  <span className="font-medium">{row.receiptNo}</span>
                  <span className="ml-2 text-xs text-muted">{when(row.createdAt)} · {row.ageDays === 0 ? "today" : row.ageDays === 1 ? "1 day" : `${row.ageDays} days`}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{money(row.openCents)}</span>
                  {allowed(session, "refund") ? <button className="h-8 rounded-sm border border-line px-2.5 text-xs" onClick={() => openReceipt(row.saleId).catch((err) => setError(err instanceof Error ? err.message : "Could not open that receipt"))}>Refund</button> : null}
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={closeBalance} className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
            <Field label="Amount received, USD">
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className={control} />
            </Field>
            <Field label="How they pay">
              <select value={method} onChange={(event) => setMethod(event.target.value)} className={control}>
                <option value="cash_usd">Cash USD</option>
                <option value="cash_ll">Cash LL</option>
                <option value="card">Card</option>
              </select>
            </Field>
            {method === "cash_ll" ? (
              <p className="text-sm text-muted sm:col-span-2">
                {Number(rate) > 0 && Number(amount) > 0 ? `Collect ${lira(liraOf(Math.round(Number(amount) * 100), Number(rate)))} LL` : "Set the lira rate in Settings before taking lira."}
              </p>
            ) : null}
            <Field label="Note"><input value={note} onChange={(event) => setNote(event.target.value)} className={control} /></Field>
            <div className="sm:col-span-2">
              <PrimaryButton pending={pending}>Close balance and print</PrimaryButton>
            </div>
          </form>
        </Panel>
      ) : null}

      {sale ? (
        <ReceiptSheet
          session={session}
          sale={sale}
          pharmacy={session.user.tenant.name}
          medicines={medicines}
          clientName={selected?.name}
          canRefund={allowed(session, "refund")}
          onClose={() => setSale(null)}
          onChange={async (next) => {
            setSale(next);
            const rows = await load();
            const still = selected ? rows.find((client) => client.id === selected.id) : undefined;
            if (!still) setSelectedId("");
            else setAmount((still.totalCents / 100).toFixed(2));
          }}
        />
      ) : null}

      {closing ? <ClosingSheet closing={closing} pharmacy={session.user.tenant.name} onClose={() => setClosing(null)} /> : null}
    </div>
  );
}

function ClosingSheet({ closing, pharmacy, onClose }: { closing: ClosingReceipt; pharmacy: string; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(() => window.print(), 80);
    return () => window.clearTimeout(id);
  }, [closing.receiptNo]);

  return (
    <article className="print-sheet rounded-sm border border-line bg-surface px-5 py-5">
      <div className="no-print mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">Closing receipt</p>
        <div className="flex gap-2">
          <button className="h-8 rounded-sm bg-moss px-3 text-sm font-medium text-white" onClick={() => window.print()}>Print</button>
          <button className="h-8 rounded-sm border border-line px-3 text-sm" onClick={onClose}>Close</button>
        </div>
      </div>
      <p className="text-xs font-medium text-muted">{pharmacy}</p>
      <h2 className="mt-1 text-lg font-semibold">{closing.receiptNo}</h2>
      <p className="mt-1 text-sm text-muted">{when(closing.createdAt)} · {clock(closing.createdAt)} · {closing.patient.name}</p>
      <p className="mt-1 text-sm">{paymentLabel(closing.method)}{closing.llAmount ? ` · ${lira(closing.llAmount)} LL` : ""}</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {closing.lines.map((line) => (
          <li key={line.receiptNo} className="flex items-baseline justify-between gap-3 py-3 text-sm">
            <span>
              <span className="font-medium">{line.receiptNo}</span>
              <span className="ml-2 text-muted">credit closed · {when(line.createdAt)}</span>
            </span>
            <span className="tabular-nums">{money(line.amountCents)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between text-sm">
        <span className="font-medium">Received</span>
        <span className="text-base font-semibold tabular-nums">{money(closing.amountCents)}</span>
      </div>
      <p className="mt-1 text-sm text-muted">Still on account {money(closing.balanceCents)}</p>
      {closing.note ? <p className="mt-3 text-sm">{closing.note}</p> : null}
    </article>
  );
}
