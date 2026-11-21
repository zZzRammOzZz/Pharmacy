"use client";

import { useEffect, useState } from "react";
import { money, Session, api } from "@/lib/api";
import { Report, ReportRange } from "@/lib/types";
import { Notice, Panel } from "./ui";

export function Reports({ session }: { session: Session }) {
  const [range, setRange] = useState<ReportRange>("month");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setError("");
    api<Report>(`/pharmacy/reports?range=${range}`, session)
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
  }, [session, range]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-line bg-surface p-1">
          {(["today", "month"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`h-9 rounded-full px-4 text-sm font-semibold ${range === id ? "bg-moss text-[#04281c]" : "text-muted hover:text-ink"}`}
            >
              {id === "today" ? "Today" : "This month"}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted">{report ? `${report.receipts} receipts` : "Loading the report…"}</p>
      </div>
      <Notice message={error} />
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
          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="By day">
              {report.byDay.length ? (
              <ul>
                {report.byDay.map((day) => (
                  <li key={day.date} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-b-0">
                    <span>
                      <span className="font-medium">{labelDay(day.date)}</span>
                      <span className="mt-0.5 block text-xs text-muted">{day.receipts} receipts · collected {money(day.collectedCents)}</span>
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
                        <span className="mt-0.5 block text-xs text-muted">{product.quantity} packs · cost {money(product.costCents)}</span>
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

function labelDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(year, month - 1, day));
}
