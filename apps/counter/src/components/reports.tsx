"use client";

import { useEffect, useState } from "react";
import { money, paymentLabel, Session, api } from "@/lib/api";
import { Report, ReportRange } from "@/lib/types";
import { control, Notice, Panel } from "./ui";

export function Reports({ session }: { session: Session }) {
  const [range, setRange] = useState<ReportRange>("month");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayInput());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const rangeReady = range !== "custom" || (Boolean(from) && Boolean(to) && from <= to);

  useEffect(() => {
    if (!rangeReady) return;
    let live = true;
    setError("");
    const query = range === "custom" ? `range=custom&from=${from}&to=${to}` : `range=${range}`;
    api<Report>(`/pharmacy/reports?${query}`, session)
      .then((data) => {
        if (live) setReport(data);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setReport(null);
        setError(err instanceof Error ? err.message : "Could not load the report");
      });
    return () => {
      live = false;
    };
  }, [session, range, from, to, rangeReady]);

  const methods = report?.byMethod || [];
  const highlights = report?.highlights || [];
  const peak = report ? Math.max(...report.byDay.map((day) => day.soldCents), 1) : 1;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-line bg-surface p-1">
            {([
              ["today", "Today"],
              ["month", "This month"],
              ["custom", "Dates"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRange(id)}
                className={`h-9 rounded-full px-4 text-sm font-semibold ${range === id ? "bg-moss text-[#04281c]" : "text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {range === "custom" ? (
            <div className="flex items-center gap-2">
              <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className={`${control} w-40`} aria-label="From" />
              <span className="text-xs text-muted">to</span>
              <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className={`${control} w-40`} aria-label="To" />
            </div>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          {report ? `${labelDay(isoDay(report.from))} – ${labelDay(dayBefore(report.to))} · ${counted(report.receipts, "receipt", "receipts")}` : "Loading the report…"}
        </p>
      </div>
      <Notice message={range === "custom" && from > to ? "The start date has to come first." : error} />
      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Sold" value={money(report.soldCents)} hint="Goods that left the shelf" />
            <Metric label="Collected" value={money(report.collectedCents)} hint="Money that came in" />
            <Metric label="Profit" value={money(report.profitCents)} hint={report.soldCents ? `${report.margin}% of what sold` : "No sales in this period"} accent />
            <Metric label="Open credit" value={money(report.openCreditCents)} hint="Still owed by clients" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Cost of goods" value={money(report.costCents)} hint="What those packs cost" />
            <Metric label="Written off" value={money(report.expiredWasteCents + report.otherWasteCents)} hint={wasteHint(report)} />
            <Metric label="Expired on the shelf" value={money(report.expiredOnShelfCents)} hint="Still in stock, past its date" />
          </div>
          {highlights.length ? (
            <Panel title="Reading">
              <ul className="grid gap-2 px-5 py-4 text-sm">
                {highlights.map((line) => <li key={line}>{line}</li>)}
              </ul>
            </Panel>
          ) : null}
          <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
            <Panel title="Sales by day">
              {report.byDay.length ? (
                <div className="overflow-x-auto px-5 py-4">
                  <div className="flex h-48 items-end gap-1" style={{ minWidth: Math.max(report.byDay.length * 28, 280) }}>
                    {report.byDay.map((day) => (
                      <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${labelDay(day.date)} · ${money(day.soldCents)}`}>
                        <div className="flex h-36 w-full items-end">
                          <div className="w-full rounded-t bg-moss" style={{ height: `${Math.max(day.soldCents > 0 ? 6 : 0, (day.soldCents / peak) * 100)}%` }} />
                        </div>
                        <span className="text-[10px] text-muted">{day.date.slice(8)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Nothing moved in this period.</p>
              )}
            </Panel>
            <Panel title="How it was paid">
              {methods.length ? (
                <Bars rows={methods.map((row) => ({ key: row.method, label: paymentLabel(row.method), hint: counted(row.receipts, "receipt", "receipts"), cents: row.cents }))} />
              ) : (
                <p className="px-5 py-6 text-sm text-muted">No tenders in this period.</p>
              )}
            </Panel>
          </div>
          <Panel title="Profit by product">
            {report.byProduct.length ? (
              <Bars
                rows={report.byProduct.slice(0, 8).map((product) => ({
                  key: product.id,
                  label: product.name,
                  hint: packs(product.quantity),
                  cents: product.profitCents,
                }))}
              />
            ) : (
              <p className="px-5 py-6 text-sm text-muted">Nothing sold in this period.</p>
            )}
          </Panel>
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="By day">
              {report.byDay.some((day) => day.receipts || day.soldCents || day.collectedCents || day.costCents) ? (
              <ul>
                {report.byDay.filter((day) => day.receipts || day.soldCents || day.collectedCents || day.costCents).map((day) => (
                  <li key={day.date} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-b-0">
                    <span>
                      <span className="font-medium">{labelDay(day.date)}</span>
                      <span className="mt-0.5 block text-xs text-muted">{counted(day.receipts, "receipt", "receipts")} · collected {money(day.collectedCents)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{money(day.soldCents)}</span>
                      <span className={`mt-0.5 block text-xs ${day.profitCents < 0 ? "text-[#ffb4ab]" : "text-moss"}`}>{money(day.profitCents)} profit</span>
                    </span>
                  </li>
                ))}
              </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Nothing moved in this period.</p>
              )}
            </Panel>
            <Panel title="By product">
              {report.byProduct.length ? (
                <ul>
                  {report.byProduct.map((product) => (
                    <li key={product.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-b-0">
                      <span>
                        <span className="font-medium">{product.name}</span>
                        <span className="mt-0.5 block text-xs text-muted">{packs(product.quantity)} · cost {money(product.costCents)}</span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold">{money(product.soldCents)}</span>
                        <span className={`mt-0.5 block text-xs ${product.profitCents < 0 ? "text-[#ffb4ab]" : "text-moss"}`}>{money(product.profitCents)} profit</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-6 text-sm text-muted">Nothing sold in this period.</p>
              )}
            </Panel>
          </div>
          <Panel title="By staff">
            <ul>
              {report.byStaff.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-b-0">
                  <span>
                    <span className="font-medium">{person.name}</span>
                    <span className="mt-0.5 block text-xs capitalize text-muted">{person.role || "Not recorded"} · {person.receipts} receipts</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold">{money(person.soldCents)}</span>
                    <span className="mt-0.5 block text-xs text-muted">collected {money(person.collectedCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          {report.refundCents ? <p className="text-sm text-muted">Refunds in this period: {money(report.refundCents)}.</p> : null}
        </>
      ) : null}
    </div>
  );
}

function Bars({ rows }: { rows: { key: string; label: string; hint: string; cents: number }[] }) {
  const peak = Math.max(...rows.map((row) => Math.abs(row.cents)), 1);
  return (
    <ul className="grid gap-3 px-5 py-4">
      {rows.map((row) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">{row.label}</span>
              <span className="mt-0.5 block text-xs text-muted">{row.hint}</span>
            </span>
            <span className={`tabular-nums ${row.cents < 0 ? "text-[#ffb4ab]" : ""}`}>{money(row.cents)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#121a17]">
            <div className={`h-2 rounded-full ${row.cents < 0 ? "bg-[#8d332c]" : "bg-moss"}`} style={{ width: `${Math.max(row.cents === 0 ? 0 : 4, (Math.abs(row.cents) / peak) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Metric({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${accent ? "text-moss" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </article>
  );
}

function wasteHint(report: Report) {
  if (!report.expiredWasteCents && !report.otherWasteCents) return "Expired, damaged, or recalled";
  if (!report.otherWasteCents) return "Expired packs written off";
  return `${money(report.expiredWasteCents)} expired · ${money(report.otherWasteCents)} other`;
}

function packs(quantity: number) {
  return counted(quantity, "pack", "packs");
}

function counted(quantity: number, one: string, many: string) {
  return `${quantity} ${Math.abs(quantity) === 1 ? one : many}`;
}

function labelDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}

function isoDay(value: string) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayBefore(value: string) {
  const date = new Date(value);
  date.setDate(date.getDate() - 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
