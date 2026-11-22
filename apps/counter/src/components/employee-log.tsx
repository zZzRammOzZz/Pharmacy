"use client";

import { useEffect, useState } from "react";
import { clock, Session, api } from "@/lib/api";
import { EmployeeLogReport, ReportRange } from "@/lib/types";
import { control, Notice, Panel } from "./ui";

export function EmployeeLog({ session }: { session: Session }) {
  const [range, setRange] = useState<ReportRange>("month");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayInput());
  const [staffId, setStaffId] = useState("");
  const [report, setReport] = useState<EmployeeLogReport | null>(null);
  const [error, setError] = useState("");
  const rangeReady = range !== "custom" || (Boolean(from) && Boolean(to) && from <= to);

  useEffect(() => {
    if (!rangeReady) return;
    let live = true;
    setError("");
    const query = new URLSearchParams(range === "custom" ? { range, from, to } : { range });
    if (staffId) query.set("staffId", staffId);
    api<EmployeeLogReport>(`/pharmacy/employee-log?${query.toString()}`, session)
      .then((data) => {
        if (live) setReport(data);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setReport(null);
        setError(err instanceof Error ? err.message : "Could not load the employee log");
      });
    return () => {
      live = false;
    };
  }, [session, range, from, to, staffId, rangeReady]);

  const groups = new Map<string, EmployeeLogReport["entries"]>();
  for (const row of report?.entries || []) {
    const key = isoDay(row.at);
    groups.set(key, [...(groups.get(key) || []), row]);
  }

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
          <select value={staffId} onChange={(event) => setStaffId(event.target.value)} className={`${control} w-48`} aria-label="Employee">
            <option value="">Everyone</option>
            {(report?.staff || []).map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </div>
        <p className="text-sm text-muted">{report ? `${report.entries.length} lines` : "Loading the log…"}</p>
      </div>
      <Notice message={range === "custom" && from > to ? "The start date has to come first." : error} />
      {report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Signed in" value={String(report.signIns)} />
            <Metric label="Signed out" value={String(report.signOuts)} />
            <Metric label="Sales" value={String(report.sales)} />
            <Metric label="Refunds" value={String(report.refunds)} />
          </div>
          {report.entries.length ? (
            [...groups.entries()].map(([day, rows]) => (
              <Panel key={day} title={labelDay(day)}>
                <ul>
                  {rows.map((row, index) => (
                    <li key={`${row.at}-${index}`} className="flex items-start justify-between gap-3 border-b border-line px-5 py-3 text-sm last:border-b-0">
                      <span>
                        <span className="font-medium">{row.name}</span>
                        <span className="mt-0.5 block text-xs text-muted">{[row.role, row.branch].filter(Boolean).join(" · ")}</span>
                        <span className="mt-1 block">{row.summary}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${tone(row.action)}`}>{actionLabel(row.action)}</span>
                        <span className="mt-1 block text-xs text-muted">{clock(row.at)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))
          ) : (
            <Panel title="Employee log">
              <p className="px-5 py-6 text-sm text-muted">Nothing was recorded in this period.</p>
            </Panel>
          )}
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-line bg-surface px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function actionLabel(action: string) {
  if (action === "login") return "Signed in";
  if (action === "logout") return "Signed out";
  if (action === "sale") return "Sale";
  if (action === "refund") return "Refund";
  if (action === "replace") return "Replacement";
  if (action === "payment") return "Payment";
  if (action === "purchase") return "Goods in";
  if (action === "waste") return "Write-off";
  if (action === "adjustment") return "Adjustment";
  if (action === "correction") return "Correction";
  return action;
}

function tone(action: string) {
  if (action === "refund" || action === "waste") return "bg-[#3a1c1c] text-[#ffb4ab]";
  if (action === "login" || action === "sale") return "bg-moss/20 text-mossdeep";
  return "bg-[#121a17] text-muted";
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

function monthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
