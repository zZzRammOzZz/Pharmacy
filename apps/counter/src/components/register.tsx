"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, clock, money, Session } from "@/lib/api";
import { Medicine, Patient, Sale } from "@/lib/types";
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
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  async function load() {
    const [meds, people, recent] = await Promise.all([
      api<Medicine[]>("/pharmacy/medicines", session),
      session.license.features.includes("patients") ? api<Patient[]>("/pharmacy/patients", session) : Promise.resolve([]),
      api<Sale[]>("/pharmacy/sales", session),
    ]);
    setMedicines(meds);
    setPatients(people);
    setSales(recent);
  }

  useEffect(() => {
    load().catch((err: Error) => setError(err.message));
    searchRef.current?.focus();
  }, []);

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
    setLastSale(null);
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
    setPending(true);
    setError("");
    try {
      const sale = await api<Sale>("/pharmacy/sales", session, {
        method: "POST",
        body: JSON.stringify({
          patientId: patientId || undefined,
          items: lines.map((line) => ({ medicineId: line.medicine.id, quantity: line.quantity })),
        }),
      });
      setLastSale(sale);
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
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-sm border border-line bg-white">
        <div className="border-b border-line p-3">
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
            <thead className="sticky top-0 bg-[#f6f8f7] text-xs text-muted">
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
                      {medicine.strength ? <span className="text-stone-500"> {medicine.strength}</span> : null}
                      <span className="mt-0.5 block text-xs text-stone-500">{medicine.sku}{medicine.barcode ? ` · ${medicine.barcode}` : ""}</span>
                    </button>
                  </td>
                  <td className={`px-4 py-3 tabular-nums ${(medicine.inDate ?? medicine.onHand) <= medicine.reorderLevel ? "text-[#8a3b32]" : ""}`}>{medicine.inDate ?? medicine.onHand}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(medicine.unitPriceCents)}</td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr><td className="px-4 py-8 text-stone-500" colSpan={3}>Nothing matches that search.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4">
        <aside className="rounded-sm border border-line bg-white">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-sm font-semibold">Current sale</h2>
            <span className="text-xs text-muted">{lines.length} {lines.length === 1 ? "line" : "lines"}</span>
          </header>
          <div className="px-4 py-3">
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
                      <div className="inline-flex rounded-sm border border-line">
                        <button className="h-7 w-7" onClick={() => setQuantity(line.medicine.id, line.quantity - 1)}>-</button>
                        <span className="grid w-7 place-items-center text-xs tabular-nums">{line.quantity}</span>
                        <button className="h-7 w-7" onClick={() => setQuantity(line.medicine.id, line.quantity + 1)}>+</button>
                      </div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(line.quantity * line.medicine.unitPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="text-sm text-muted">Total</span>
              <span className="text-xl font-semibold tabular-nums">{money(total)}</span>
            </div>
            <div className="mt-3"><Notice message={error} /></div>
            {lastSale ? (
              <p className="mt-3 rounded-sm border border-[#cfe3d8] bg-[#f3faf6] px-3 py-2 text-sm text-mossdeep">
                {lastSale.receiptNo} recorded · {money(lastSale.totalCents)}
              </p>
            ) : null}
            <button
              className="mt-3 h-10 w-full rounded-sm bg-moss text-sm font-medium text-white disabled:bg-stone-300"
              disabled={pending || lines.length === 0}
              onClick={charge}
            >
              {pending ? "Recording sale…" : "Take payment"}
            </button>
          </div>
        </aside>
        <section className="rounded-sm border border-line bg-white">
          <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Recent receipts</h2>
          <ul>
            {sales.slice(0, 6).map((sale) => (
              <li key={sale.id} className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2 text-sm last:border-b-0">
                <span className="min-w-0">
                  <span className="font-medium">{sale.receiptNo}</span>
                  <span className="ml-2 text-xs text-muted">{clock(sale.createdAt)} · {sale.items.map((item) => `${item.medicine.name} × ${item.quantity}`).join(", ")}</span>
                </span>
                <span className="tabular-nums">{money(sale.totalCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
