"use client";

import { ReactNode, useEffect, useState } from "react";
import { api, Session } from "@/lib/api";
import { Bootstrap, Section } from "@/lib/types";

const titles: Record<Section, { title: string; detail: string }> = {
  today: { title: "Shift", detail: "Takings, reorders, and expiries for this pharmacy" },
  register: { title: "Register", detail: "Build a sale and take payment" },
  stock: { title: "Stock", detail: "Catalog, purchases, adjustments, and waste" },
  patients: { title: "Clients", detail: "Profiles, allergies, and what each person has bought" },
  prescriptions: { title: "Prescriptions", detail: "Queue, dispense, and file new scripts" },
  suppliers: { title: "Suppliers", detail: "Profiles and the invoices received from each wholesaler" },
};

export function Shell({
  session,
  section,
  onSection,
  onSignOut,
  children,
}: {
  session: Session;
  section: Section;
  onSection: (section: Section) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [now, setNow] = useState(() => new Date());
  const [badges, setBadges] = useState({ low: 0, expired: 0, scripts: 0 });
  const features = session.license.features;
  const days = Math.max(0, Math.ceil((new Date(session.license.expiresAt).getTime() - Date.now()) / 86400000));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api<Bootstrap>("/pharmacy/bootstrap", session)
      .then((data) => setBadges({ low: data.lowStock.length, expired: data.expired.length, scripts: data.pendingPrescriptions }))
      .catch(() => undefined);
  }, [session, section]);

  const items: { id: Section; label: string; badge?: number }[] = [
    { id: "today", label: "Shift" },
    { id: "register", label: "Register" },
    { id: "stock", label: "Stock", badge: badges.expired || badges.low },
    { id: "patients", label: "Clients" },
    ...(features.includes("prescriptions") ? [{ id: "prescriptions" as const, label: "Prescriptions", badge: badges.scripts }] : []),
    ...(features.includes("suppliers") ? [{ id: "suppliers" as const, label: "Suppliers" }] : []),
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink lg:grid lg:grid-cols-[216px_1fr]">
      <aside className="flex flex-col border-b border-line bg-white lg:min-h-screen lg:border-b-0 lg:border-r">
        <div className="px-4 py-4">
          <p className="text-[11px] font-medium text-muted">PharmacyOS</p>
          <p className="mt-1 text-sm font-semibold leading-5">{session.user.tenant.name}</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible lg:px-2">
          {items.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSection(item.id)}
                className={`flex h-9 shrink-0 items-center justify-between gap-3 rounded-sm px-3 text-left text-sm ${active ? "bg-[#e7f3ee] font-medium text-mossdeep" : "text-muted hover:bg-[#f6f8f7]"}`}
              >
                <span>{item.label}</span>
                {item.badge ? <span className="min-w-5 rounded-sm bg-[#f8e8e6] px-1.5 text-center text-[11px] font-medium text-[#8d332c]">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden border-t border-line px-4 py-4 text-xs leading-5 lg:block">
          <p className="font-medium text-ink">{session.user.name}</p>
          <p className="capitalize text-muted">{session.user.role}</p>
          <p className="mt-3 capitalize text-muted">{session.license.plan} · {days} days</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-line bg-white px-4 lg:px-6">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">{titles[section].title}</h1>
            <p className="truncate text-xs text-muted">{titles[section].detail}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <time className="hidden whitespace-nowrap sm:inline tabular-nums">
              {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              <span className="ml-2">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
            </time>
            <button className="h-8 whitespace-nowrap rounded-sm border border-line bg-white px-2.5 text-ink" onClick={onSignOut}>Sign out</button>
          </div>
        </header>
        <main className="px-4 py-4 lg:px-6 lg:py-5">{children}</main>
      </div>
    </div>
  );
}
