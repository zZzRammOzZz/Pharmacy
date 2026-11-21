"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, clock, lira, liraOf, money, paymentLabel, Session, when } from "@/lib/api";
import { Medicine, Sale } from "@/lib/types";
import { Field, Notice, control } from "./ui";

export function saleBalance(sale: Sale) {
  return sale.totalCents + (sale.events || []).reduce((sum, event) => sum + event.amountCents, 0);
}

export function saleMarks(sale: Sale) {
  const marks: string[] = [];
  const events = sale.events || [];
  if (events.some((event) => event.kind === "refund")) marks.push("Refund");
  if (events.some((event) => event.kind === "replace")) marks.push("Replaced");
  return marks;
}

function returnedQty(sale: Sale, itemId: string) {
  return (sale.events || []).reduce(
    (sum, event) => sum + event.lines.filter((line) => line.saleItemId === itemId && line.direction === "return").reduce((count, line) => count + line.quantity, 0),
    0,
  );
}

export function ReceiptSheet({
  session,
  sale,
  pharmacy,
  medicines,
  clientName,
  autoPrint,
  canRefund = true,
  onChange,
  onPrinted,
  onClose,
}: {
  session: Session;
  sale: Sale;
  pharmacy: string;
  medicines: Medicine[];
  clientName?: string;
  autoPrint?: boolean;
  canRefund?: boolean;
  onChange: (sale: Sale) => void;
  onPrinted?: () => void;
  onClose?: () => void;
}) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [refundAllOpen, setRefundAllOpen] = useState(false);
  const [refundNote, setRefundNote] = useState("");
  const events = sale.events || [];
  const balance = saleBalance(sale);
  const who = clientName || sale.patient?.name || "Walk-in";
  const refundable = sale.items.some((item) => item.quantity - returnedQty(sale, item.id) > 0);

  useEffect(() => {
    if (!autoPrint) return;
    const id = window.setTimeout(() => {
      window.print();
      onPrinted?.();
    }, 80);
    return () => window.clearTimeout(id);
  }, [autoPrint, sale.id]);

  function openDraft(mode: Draft["mode"], itemId: string, left: number) {
    setError("");
    setDraft({ mode, itemId, quantity: left, replacementQuantity: 1, medicineId: "", note: "" });
  }

  async function refund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setPending(true);
    setError("");
    try {
      const next = await api<Sale>(`/pharmacy/sales/${sale.id}/refund`, session, {
        method: "POST",
        body: JSON.stringify({ saleItemId: draft.itemId, quantity: draft.quantity, note: draft.note || undefined }),
      });
      setDraft(null);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The refund did not complete");
    } finally {
      setPending(false);
    }
  }

  async function refundReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const next = await api<Sale>(`/pharmacy/sales/${sale.id}/refund-all`, session, {
        method: "POST",
        body: JSON.stringify({ note: refundNote || undefined }),
      });
      setRefundAllOpen(false);
      setRefundNote("");
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The refund did not complete");
    } finally {
      setPending(false);
    }
  }

  async function replace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.medicineId) {
      setError("Choose the medicine to give instead.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const next = await api<Sale>(`/pharmacy/sales/${sale.id}/replace`, session, {
        method: "POST",
        body: JSON.stringify({
          saleItemId: draft.itemId,
          quantity: draft.quantity,
          medicineId: draft.medicineId,
          replacementQuantity: draft.replacementQuantity,
          note: draft.note || undefined,
        }),
      });
      setDraft(null);
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The replacement did not complete");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="print-sheet rounded-sm border border-line bg-surface px-5 py-5">
      <div className="no-print mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted">Receipt</p>
        <div className="flex gap-2">
          {canRefund && refundable ? (
            <button className="h-8 rounded-sm border border-line px-3 text-sm" onClick={() => { setDraft(null); setRefundAllOpen((open) => !open); }}>Refund receipt</button>
          ) : null}
          <button className="h-8 rounded-sm bg-moss px-3 text-sm font-medium text-white" onClick={() => window.print()}>Print</button>
          {onClose ? <button className="h-8 rounded-sm border border-line px-3 text-sm" onClick={onClose}>Close</button> : null}
        </div>
      </div>
      {refundAllOpen ? (
        <form onSubmit={refundReceipt} className="no-print mb-4 grid gap-2 rounded-sm border border-line bg-[#121a17] p-3">
          <p className="text-sm">Return everything still on this receipt and put it back in stock.</p>
          <Field label="Note">
            <input value={refundNote} onChange={(event) => setRefundNote(event.target.value)} className={control} />
          </Field>
          <div className="flex gap-2">
            <button disabled={pending} className="h-8 rounded-sm bg-[#8d332c] px-3 text-sm font-medium text-white disabled:opacity-60">{pending ? "Working" : "Refund receipt"}</button>
            <button type="button" className="h-8 rounded-sm border border-line px-3 text-sm" onClick={() => setRefundAllOpen(false)}>Cancel</button>
          </div>
        </form>
      ) : null}
      <p className="text-xs font-medium text-muted">{pharmacy}</p>
      <h2 className="mt-1 text-lg font-semibold">{sale.receiptNo}</h2>
      <p className="mt-1 text-sm text-muted">
        {when(sale.createdAt)} · {clock(sale.createdAt)} · {who}
      </p>
      <p className="mt-1 text-sm">{paymentLabel(sale.paymentMethod)}{sale.paymentMethod === "credit" && balance > 0 ? " · not collected yet" : ""}</p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        {sale.items.map((item) => {
          const returned = returnedQty(sale, item.id);
          const left = item.quantity - returned;
          const active = draft?.itemId === item.id;
          const replacement = medicines.find((medicine) => medicine.id === draft?.medicineId);
          const difference = active && draft.mode === "replace" && replacement
            ? replacement.unitPriceCents * draft.replacementQuantity - item.unitPriceCents * draft.quantity
            : 0;
          return (
            <li key={item.id} className="py-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{item.medicine.name}{item.medicine.strength ? ` ${item.medicine.strength}` : ""}</p>
                <p className="tabular-nums">{money(item.lineCents)}</p>
              </div>
              <p className="mt-0.5 text-muted">{item.quantity} × {money(item.unitPriceCents)}{item.origin === "replace" ? " · given in exchange" : ""}</p>
              {returned > 0 ? <p className="mt-0.5 text-xs text-[#ffb4ab]">Returned {returned}{left > 0 ? ` · ${left} still with the client` : ""}</p> : null}
              {canRefund && left > 0 && !active ? (
                <div className="no-print mt-2 flex gap-2">
                  <button className="h-8 rounded-sm border border-line px-2.5 text-xs" onClick={() => openDraft("refund", item.id, left)}>Refund</button>
                  <button className="h-8 rounded-sm border border-line px-2.5 text-xs" onClick={() => openDraft("replace", item.id, left)}>Replace</button>
                </div>
              ) : null}
              {active && draft.mode === "refund" ? (
                <form onSubmit={refund} className="no-print mt-3 grid gap-2 rounded-sm border border-line bg-[#121a17] p-3">
                  <Field label="Quantity to refund">
                    <input type="number" min={1} max={left} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: clamp(event.target.value, left) })} className={control} />
                  </Field>
                  <Field label="Note"><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className={control} /></Field>
                  <p className="text-xs text-muted">Give back {money(item.unitPriceCents * draft.quantity)}. The pack returns to stock.</p>
                  <div className="flex gap-2">
                    <button className="h-8 rounded-sm bg-[#1c1917] px-3 text-xs text-white disabled:bg-[#2c3833]" disabled={pending}>Refund</button>
                    <button type="button" className="h-8 rounded-sm border border-line bg-surface px-3 text-xs" onClick={() => setDraft(null)}>Cancel</button>
                  </div>
                </form>
              ) : null}
              {active && draft.mode === "replace" ? (
                <form onSubmit={replace} className="no-print mt-3 grid gap-2 rounded-sm border border-line bg-[#121a17] p-3">
                  <Field label="Quantity to take back">
                    <input type="number" min={1} max={left} value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: clamp(event.target.value, left) })} className={control} />
                  </Field>
                  <Field label="Give instead">
                    <select value={draft.medicineId} onChange={(event) => setDraft({ ...draft, medicineId: event.target.value })} required className={control}>
                      <option value="">Select</option>
                      {medicines.filter((medicine) => medicine.id !== item.medicine.id && medicine.inDate > 0).map((medicine) => (
                        <option key={medicine.id} value={medicine.id}>{medicine.name}{medicine.strength ? ` ${medicine.strength}` : ""} · {money(medicine.unitPriceCents)} · {medicine.inDate} in date</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quantity to give">
                    <input type="number" min={1} value={draft.replacementQuantity} onChange={(event) => setDraft({ ...draft, replacementQuantity: clamp(event.target.value, 999) })} className={control} />
                  </Field>
                  <Field label="Note"><input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} className={control} /></Field>
                  <p className="text-xs text-muted">{differenceText(difference)}</p>
                  <div className="flex gap-2">
                    <button className="h-8 rounded-sm bg-[#1c1917] px-3 text-xs text-white disabled:bg-[#2c3833]" disabled={pending}>Replace</button>
                    <button type="button" className="h-8 rounded-sm border border-line bg-surface px-3 text-xs" onClick={() => setDraft(null)}>Cancel</button>
                  </div>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
      {events.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{event.kind === "refund" ? "Refund" : "Replacement"} · {when(event.createdAt)} {clock(event.createdAt)}</p>
                <p className="tabular-nums">{money(event.amountCents)}</p>
              </div>
              {event.lines.map((line, index) => (
                <p key={`${event.id}-${index}`} className="text-muted">
                  {line.direction === "return" ? "Returned" : "Given"} {line.medicine.name}{line.medicine.strength ? ` ${line.medicine.strength}` : ""} × {line.quantity}
                </p>
              ))}
              {event.note ? <p className="text-xs text-muted">{event.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-sm text-muted">{events.length > 0 ? "Balance" : "Total"}</span>
        <span className="text-xl font-semibold tabular-nums">{money(events.length > 0 ? balance : sale.totalCents)}</span>
      </div>
      {events.length > 0 ? <p className="mt-1 text-right text-xs text-muted">{sale.paymentMethod === "credit" ? "Charged" : "Taken"} at the till {money(sale.totalCents)}</p> : null}
      {sale.paymentMethod === "cash_ll" && sale.llPerUsd ? (
        <p className="mt-1 text-right text-sm tabular-nums">{lira(liraOf(events.length > 0 ? balance : sale.totalCents, sale.llPerUsd))} LL</p>
      ) : null}
      <div className="no-print mt-3"><Notice message={error} /></div>
    </article>
  );
}

type Draft = {
  mode: "refund" | "replace";
  itemId: string;
  quantity: number;
  replacementQuantity: number;
  medicineId: string;
  note: string;
};

function clamp(value: string, max: number) {
  const next = Math.floor(Number(value));
  if (!Number.isFinite(next) || next < 1) return 1;
  return Math.min(next, max);
}

function differenceText(cents: number) {
  if (cents > 0) return `Client pays ${money(cents)} more.`;
  if (cents < 0) return `Give back ${money(-cents)}.`;
  return "Even exchange.";
}
