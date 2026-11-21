"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { allowed, api, clock, money, paymentLabel, Session } from "@/lib/api";
import { Medicine, Patient, Sale } from "@/lib/types";
import { PaymentChoice } from "./payment";
import { ReceiptSheet, saleBalance, saleMarks } from "./receipt";
import { Notice, control } from "./ui";

type Line = { medicine: Medicine; quantity: number };

export function Register({ session }: { session: Session }) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [patientId, setPatientId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [openSale, setOpenSale] = useState<Sale | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [method, setMethod] = useState("cash_usd");
  const [rate, setRate] = useState("");

  async function load() {
    const [meds, people, recent] = await Promise.all([
      api<Medicine[]>("/pharmacy/medicines", session),
      session.license.features.includes("patients") ? api<Patient[]>("/pharmacy/patients", session) : Promise.resolve([]),
      api<Sale[]>("/pharmacy/sales", session),
    ]);
    setMedicines(meds);
    setPatients(people);
    setSales(recent);
    setOpenSale((current) => (current ? recent.find((row) => row.id === current.id) ?? current : null));
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
    api<{ llPerUsd: number }>("/pharmacy/till", session)
      .then((till) => setRate(till.llPerUsd ? String(till.llPerUsd) : ""))
      .catch(() => undefined);
    searchRef.current?.focus();
  }, []);

  async function saveRate(next: string) {
    const llPerUsd = Number(next);
    if (!Number.isInteger(llPerUsd) || llPerUsd < 1) return;
    await api("/pharmacy/till", session, { method: "PATCH", body: JSON.stringify({ llPerUsd }) });
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return medicines;
    return medicines.filter((medicine) =>
      `${medicine.name} ${medicine.sku} ${medicine.barcode || ""} ${medicine.genericName || ""}`.toLowerCase().includes(needle),
    );
  }, [medicines, query]);

  function add(medicine: Medicine) {
    const current = lines.find((line) => line.medicine.id === medicine.id)?.quantity ?? 0;
    const available = medicine.inDate ?? medicine.onHand;
    if (available < 1 || current + 1 > available) {
      setError(medicine.onHand > available ? `${medicine.name} has no in-date stock. Expired packs have to be wasted.` : `${medicine.name} does not have enough on the shelf.`);
      return;
    }
    setError("");
    setLines((currentLines) => {
      const existing = currentLines.find((line) => line.medicine.id === medicine.id);
      if (!existing) return [...currentLines, { medicine, quantity: 1 }];
      return currentLines.map((line) =>
        line.medicine.id === medicine.id ? { ...line, quantity: line.quantity + 1 } : line,
      );
    });
    setQuery("");
    searchRef.current?.focus();
  }

  function setQuantity(id: string, quantity: number) {
    const medicine = medicines.find((item) => item.id === id);
    if (!medicine) return;
    if (quantity < 1) {
      setLines((currentLines) => currentLines.filter((line) => line.medicine.id !== id));
      return;
    }
    const available = medicine.inDate ?? medicine.onHand;
    if (quantity > available) {
      setError(`Only ${available} ${medicine.name} in date.`);
      return;
    }
    setError("");
    setLines((currentLines) => currentLines.map((line) => (line.medicine.id === id ? { ...line, quantity } : line)));
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.medicine.unitPriceCents, 0);

  async function charge() {
    if (lines.length === 0) return;
    if (method === "credit" && !patientId) {
      setError("Choose a client to put this on account.");
      return;
    }
    if (method === "cash_ll" && (!Number.isInteger(Number(rate)) || Number(rate) < 1)) {
      setError("Set how many lira equal one dollar.");
      return;
    }
    setPending(true);
    setError("");
    try {
      if (method === "cash_ll") await saveRate(rate);
      const sale = await api<Sale>("/pharmacy/sales", session, {
        method: "POST",
        body: JSON.stringify({
          patientId: patientId || undefined,
          paymentMethod: method,
          items: lines.map((line) => ({ medicineId: line.medicine.id, quantity: line.quantity })),
        }),
      });
      setOpenSale(sale);
      setAutoPrint(true);
      setLines([]);
      setPatientId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sale did not complete");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
        <div className="border-b border-line p-4">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const exact = medicines.find((medicine) => medicine.barcode && medicine.barcode.toLowerCase() === query.trim().toLowerCase());
                const pick = exact || filtered[0];
                if (!pick) return;
                event.preventDefault();
                add(pick);
              }
            }}
            placeholder="Search name, SKU, or scan a barcode"
            className={control}
          />
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#121a17] text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Medicine</th>
                <th className="px-4 py-2 font-medium">In date</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((medicine) => (
                <tr key={medicine.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <button className="text-left" onClick={() => add(medicine)}>
                      <span className="font-medium">{medicine.name}</span>
                      {medicine.strength ? <span className="text-muted"> {medicine.strength}</span> : null}
                      <span className="mt-0.5 block text-xs text-muted">{medicine.sku}{medicine.barcode ? ` · ${medicine.barcode}` : ""}</span>
                    </button>
                  </td>
                  <td className={`px-4 py-3 tabular-nums ${(medicine.inDate ?? medicine.onHand) <= medicine.reorderLevel ? "text-[#ffb4ab]" : ""}`}>{medicine.inDate ?? medicine.onHand}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(medicine.unitPriceCents)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td className="px-4 py-8 text-muted" colSpan={3}>Nothing matches that search.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4">
        <aside className="rounded-xl border border-line bg-surface shadow-card">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-sm font-semibold">Current sale</h2>
            <span className="text-xs text-muted">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>
          </header>
          <div className="px-5 py-4">
            <label className="block text-xs font-medium text-muted">
              Client
              <select value={patientId} onChange={(event) => setPatientId(event.target.value)} className={`${control} mt-1`}>
                <option value="">Walk-in</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
              </select>
            </label>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {lines.length === 0 ? (
                  <tr><td className="py-8 text-center text-sm text-muted">Select a medicine to start the sale.</td></tr>
                ) : null}
                {lines.map((line) => (
                  <tr key={line.medicine.id} className="border-t border-line">
                    <td className="py-2 pr-2">
                      <p className="font-medium">{line.medicine.name}</p>
                      <p className="text-xs text-muted">{money(line.medicine.unitPriceCents)}</p>
                    </td>
                    <td className="py-2">
                      <div className="inline-flex overflow-hidden rounded-lg border border-line">
                        <button className="h-8 w-8 hover:bg-white/5" onClick={() => setQuantity(line.medicine.id, line.quantity - 1)}>-</button>
                        <span className="grid w-8 place-items-center text-sm tabular-nums">{line.quantity}</span>
                        <button className="h-8 w-8 hover:bg-white/5" onClick={() => setQuantity(line.medicine.id, line.quantity + 1)}>+</button>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(line.quantity * line.medicine.unitPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="text-sm text-muted">Total</span>
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{money(total)}</span>
            </div>
            <PaymentChoice
              method={method}
              onMethod={setMethod}
              rate={rate}
              onRate={setRate}
              onRateCommit={(next) => saveRate(next).catch((err: Error) => setError(err.message))}
              totalCents={total}
              allowCredit={Boolean(patientId)}
            />
            <div className="mt-3"><Notice message={error} /></div>
            <button
              className="mt-4 h-12 w-full rounded-lg bg-moss text-sm font-semibold text-[#04281c] shadow-sm hover:bg-[#62d4a4] disabled:bg-[#2c3833] disabled:text-muted"
              disabled={pending || lines.length === 0 || (method === "credit" && !patientId)}
              onClick={charge}
            >
              {pending ? "Recording sale…" : method === "credit" ? "Charge to account" : "Take payment"}
            </button>
          </div>
        </aside>
        {openSale ? (
          <ReceiptSheet
            session={session}
            sale={openSale}
            pharmacy={session.user.tenant.name}
            medicines={medicines}
            autoPrint={autoPrint}
            canRefund={allowed(session, "refund")}
            onPrinted={() => setAutoPrint(false)}
            onClose={() => setOpenSale(null)}
            onChange={(sale) => {
              setOpenSale(sale);
              setAutoPrint(false);
              load().catch((err: Error) => setError(err.message));
            }}
          />
        ) : null}
        <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Recent receipts</h2>
          <ul>
            {sales.slice(0, 8).map((sale) => (
              <li key={sale.id} className="border-b border-line last:border-b-0">
                <button className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-white/5" onClick={() => { setOpenSale(sale); setAutoPrint(false); }}>
                  <span className="min-w-0">
                    <span className="font-medium">{sale.receiptNo}</span>
                    <span className="ml-2 text-xs text-muted">{sale.patient?.name || "Walk-in"} · {paymentLabel(sale.paymentMethod)} · {clock(sale.createdAt)}</span>
                    {saleMarks(sale).map((mark) => <span key={mark} className="ml-2 text-[11px] font-medium text-[#ffb4ab]">{mark}</span>)}
                  </span>
                  <span className="tabular-nums">{money(saleBalance(sale))}</span>
                </button>
              </li>
            ))}
            {sales.length === 0 ? <li className="px-4 py-6 text-sm text-muted">No receipts yet.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
