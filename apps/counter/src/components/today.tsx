"use client";

import { useEffect, useState } from "react";
import { allowed, api, clock, money, paymentLabel, Session, when } from "@/lib/api";
import { Bootstrap, Reading, Section } from "@/lib/types";
import { Notice } from "./ui";

export function Today({ session, onSection }: { session: Session; onSection: (section: Section) => void }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [scope, setScope] = useState<"branch" | "all">("branch");
  const [error, setError] = useState("");
  const grouped = session.license.features.includes("branches") && session.user.role === "owner";

  useEffect(() => {
    api<Bootstrap>("/pharmacy/bootstrap", session).then(setData).catch((err: Error) => setError(err.message));
    api<Reading>(`/pharmacy/reading${scope === "all" ? "?scope=all" : ""}`, session).then(setReading).catch(() => undefined);
  }, [session, scope]);

  if (error) return <Notice message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading the shift…</p>;

  const main = allowed(session, "mainReading");
  const takings = main ? reading?.main?.takingsCents ?? data.salesToday.totalCents : reading?.mine.takingsCents ?? data.salesToday.totalCents;
  const receipts = main ? reading?.main?.receipts ?? data.salesToday.count : reading?.mine.receipts ?? data.salesToday.count;
  const first = session.user.name.split(" ")[0];
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const peak = Math.max(1, ...(reading?.main?.staff.map((person) => person.takingsCents) || [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-moss">{today}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{hello}, {first}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="h-11 rounded-full bg-[#07382c] px-5 text-sm font-semibold text-white hover:bg-[#0b4a39]" onClick={() => onSection("register")}>Open register</button>
          {session.license.features.includes("prescriptions") ? (
            <button className="h-11 rounded-full bg-surface px-5 text-sm font-semibold text-ink shadow-card" onClick={() => onSection("prescriptions")}>
              Scripts{data.pendingPrescriptions ? ` · ${data.pendingPrescriptions}` : ""}
            </button>
          ) : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#07382c_0%,#0e8f62_62%,#7dcea8_140%)] px-6 py-7 text-white shadow-card sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-white/70">{scope === "all" ? "All branches" : grouped && main ? "This branch" : main ? "Pharmacy takings" : "Your takings"}</p>
            <p className="mt-1 text-5xl font-semibold tracking-tight tabular-nums">{money(takings)}</p>
          </div>
          <div className="max-w-sm">
            {grouped ? (
              <div className="mb-3 flex w-fit rounded-full bg-white/10 p-1 text-xs font-semibold">
                <button type="button" className={`rounded-full px-3 py-1.5 ${scope === "branch" ? "bg-white text-[#04281c]" : "text-white/80"}`} onClick={() => setScope("branch")}>This branch</button>
                <button type="button" className={`rounded-full px-3 py-1.5 ${scope === "all" ? "bg-white text-[#04281c]" : "text-white/80"}`} onClick={() => setScope("all")}>All branches</button>
              </div>
            ) : null}
            <p className="text-sm leading-6 text-white/75">
              {scope === "all" ? "Every branch today, added together." : main ? "Everyone on the counter today, in one figure." : "This is your till. The owner sees the full reading."}
            </p>
          </div>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Metric label="Receipts" value={String(receipts)} />
          <Metric label="Scripts waiting" value={String(data.pendingPrescriptions)} />
          <Metric label="Clients" value={String(data.patientCount)} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        {reading ? (
          <article className="rounded-[24px] bg-surface p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">My reading</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{money(reading.mine.takingsCents)}</p>
            <p className="mt-1 text-sm text-muted">{reading.mine.receipts} {reading.mine.receipts === 1 ? "receipt" : "receipts"} today</p>
            {reading.main && reading.main.takingsCents > 0 ? (
              <div className="mt-5">
                <div className="h-2 overflow-hidden rounded-full bg-[#1a3329]">
                  <div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(100, Math.round((reading.mine.takingsCents / reading.main.takingsCents) * 100))}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted">{Math.round((reading.mine.takingsCents / reading.main.takingsCents) * 100)}% of the pharmacy today</p>
              </div>
            ) : null}
          </article>
        ) : (
          <article className="rounded-[24px] bg-surface p-5 shadow-card text-sm text-muted">Loading your reading…</article>
        )}

        {reading?.main ? (
          <article className="rounded-[24px] bg-surface p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Main reading</p>
            <ul className="mt-4 space-y-4">
              {reading.main.staff.map((person) => (
                <li key={person.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className="font-semibold">{person.name}</span>
                      {person.role ? <span className="ml-2 text-xs capitalize text-muted">{person.role}</span> : null}
                      {person.branch ? <span className="ml-2 text-xs text-muted">{person.branch}</span> : null}
                    </span>
                    <span className="tabular-nums font-semibold">{money(person.takingsCents)}</span>
                  </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#121a17]">
                    <div className="h-full rounded-full bg-[#07382c]" style={{ width: person.takingsCents > 0 ? `${Math.max(8, Math.round((person.takingsCents / peak) * 100))}%` : "0%" }} />
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ) : reading ? (
          <article className="rounded-[24px] bg-surface p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Needs a look</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Alert count={data.lowStock.length} label="below reorder" onClick={() => onSection("stock")} />
              <Alert count={data.expired.length} label="expired batches" onClick={() => onSection("stock")} />
            </div>
          </article>
        ) : null}
      </div>

      {reading?.main ? (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-[24px] bg-surface p-5 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Today</p>
            {reading.main.lines.length === 0 ? <p className="mt-4 text-sm text-muted">Nothing through the till yet.</p> : null}
            <ul className="mt-3 divide-y divide-line">
              {reading.main.lines.map((line, index) => (
                <li key={`${line.at}-${line.label}-${index}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill(line.kind)}`}>{lineLabel(line.kind)}</span>
                    <span className="font-medium">{line.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{line.who} · {paymentLabel(line.method)} · {clock(line.at)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums font-semibold">{money(line.amountCents)}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-[24px] bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Needs a look</p>
              <button className="text-xs font-semibold text-moss" onClick={() => onSection("stock")}>Open stock</button>
            </div>
            <div className="mt-4 space-y-3">
              {data.lowStock.slice(0, 4).map((medicine) => (
                <div key={medicine.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{medicine.name}</span>
                  <span className="text-[#ffb4ab]">{medicine.onHand} left</span>
                </div>
              ))}
              {data.expired.slice(0, 3).map((batch) => (
                <div key={batch.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{batch.medicine}</span>
                  <span className="text-[#ffb4ab]">Expired</span>
                </div>
              ))}
              {data.expiring.slice(0, 3).map((batch) => (
                <div key={batch.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium">{batch.medicine}</span>
                    <span className="ml-2 text-xs text-muted">{batch.batchNumber}</span>
                  </span>
                  <span className="text-muted">{when(batch.expiryDate)}</span>
                </div>
              ))}
              {data.lowStock.length === 0 && data.expired.length === 0 && data.expiring.length === 0 ? (
                <p className="text-sm text-muted">Stock and expiry look clear.</p>
              ) : null}
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur">
      <p className="text-xs text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Alert({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl bg-[#121a17] px-4 py-4 text-left">
      <p className="text-2xl font-semibold tabular-nums">{count}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </button>
  );
}

function lineLabel(kind: string) {
  if (kind === "refund") return "Refund";
  if (kind === "replace") return "Replace";
  if (kind === "close") return "Closing";
  return "Sale";
}

function pill(kind: string) {
  if (kind === "refund") return "bg-[#3a201c] text-[#ffb4ab]";
  if (kind === "replace") return "bg-[#2c2416] text-[#f3d7a1]";
  if (kind === "close") return "bg-[#1a3329] text-mossdeep";
  return "bg-[#17242e] text-[#b9d4ea]";
}
