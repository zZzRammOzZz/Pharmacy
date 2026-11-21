"use client";

import { ReactNode, useEffect, useState } from "react";
import { allowed, api, Session } from "@/lib/api";
import { Bootstrap, Section } from "@/lib/types";

function Mark({ section }: { section: Section }) {
  const common = "h-[18px] w-[18px] shrink-0";
  if (section === "today") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }
  if (section === "register") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h10v18l-2-1.4-2 1.4-2-1.4L9 21l-2-1.4V3z" />
        <path d="M10 8h4M10 12h4" />
      </svg>
    );
  }
  if (section === "stock") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8l9-4 9 4-9 4-9-4z" />
        <path d="M3 8v8l9 4 9-4V8M12 12v8" />
      </svg>
    );
  }
  if (section === "patients") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 19c1.2-2.8 3.4-4 6.5-4s5.3 1.2 6.5 4" />
      </svg>
    );
  }
  if (section === "aged") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </svg>
    );
  }
  if (section === "prescriptions") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 3h7l5 5v13H7V3z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
    );
  }
  if (section === "suppliers") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" />
        <circle cx="7" cy="18" r="1.4" />
        <circle cx="17" cy="18" r="1.4" />
      </svg>
    );
  }
  if (section === "orders") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3h6l4 4v14H8V3z" />
        <path d="M14 3v4h4M10 12h6M10 16h4" />
      </svg>
    );
  }
  if (section === "wholesalers") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 10l8-6 8 6" />
        <path d="M6 10v9h12v-9" />
        <path d="M10 19v-5h4v5" />
      </svg>
    );
  }
  if (section === "reports") {
    return (
      <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5M4 19h16" />
        <path d="M8 16v-5M12 16V8M16 16v-3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="9" cy="8" r="2.4" />
      <circle cx="16" cy="9" r="1.8" />
      <path d="M4 18c.7-2.3 2.4-3.4 5-3.4s4.3 1.1 5 3.4M14.2 14.6c1.4 0 2.6.6 3.3 2" />
    </svg>
  );
}

const titles: Record<Section, { title: string; detail: string }> = {
  today: { title: "Shift", detail: "Takings, reorders, and expiries for this pharmacy" },
  register: { title: "Register", detail: "Cash in dollars or lira, card, or charge it to the client’s account" },
  stock: { title: "Stock", detail: "Catalog, purchases, adjustments, and waste" },
  patients: { title: "Clients", detail: "Profiles, receipts, refunds, and replacements" },
  aged: { title: "Client aged", detail: "Open credit by age, and a receipt when the balance is closed" },
  prescriptions: { title: "Prescriptions", detail: "Queue, dispense, and file new scripts" },
  suppliers: { title: "Suppliers", detail: "Profiles and the invoices received from each wholesaler" },
  wholesalers: { title: "Wholesaler aged", detail: "Open invoices by age, and a receipt when the pharmacy pays" },
  orders: { title: "To order", detail: "What to buy this morning, grouped by the last wholesaler" },
  reports: { title: "Reports", detail: "What sold, what it cost, and what is still owed" },
  staff: { title: "Staff", detail: "Seats on this license, and what each person can do" },
};

export function Shell({
  session,
  section,
  onSection,
  onSignOut,
  onSession,
  children,
}: {
  session: Session;
  section: Section;
  onSection: (section: Section) => void;
  onSignOut: () => void;
  onSession: (session: Session) => void;
  children: ReactNode;
}) {
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(true);
  const [badges, setBadges] = useState({ low: 0, expired: 0, scripts: 0, aged: 0, wholesalers: 0, orders: 0 });
  const features = session.license.features;
  const days = Math.max(0, Math.ceil((new Date(session.license.expiresAt).getTime() - Date.now()) / 86400000));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (localStorage.getItem("pharmacyos_nav") === "closed") setOpen(false);
  }, []);

  function toggleNav() {
    setOpen((value) => {
      const next = !value;
      localStorage.setItem("pharmacyos_nav", next ? "open" : "closed");
      return next;
    });
  }

  useEffect(() => {
    const refresh = () => {
      api<Bootstrap>("/pharmacy/bootstrap", session)
        .then((data) => {
        setBadges({ low: data.lowStock.length, expired: data.expired.length, scripts: data.pendingPrescriptions, aged: data.agedCount || 0, wholesalers: data.supplierAgedCount || 0, orders: data.orderCount || 0 });
        if (!data.me) return;
        const nextFeatures = data.me.features || session.license.features;
        const nextBranches = data.branches || [];
        const nextPlan = data.me.plan || session.license.plan;
        const nextSeats = data.me.seats || session.license.seats;
        const branchOk = !nextBranches.length || nextBranches.some((branch) => branch.id === session.branchId);
        const same =
          session.user.role === data.me.role &&
          JSON.stringify(session.user.permissions || []) === JSON.stringify(data.me.permissions) &&
          JSON.stringify(session.license.features) === JSON.stringify(nextFeatures) &&
          session.license.plan === nextPlan &&
          session.license.seats === nextSeats &&
          JSON.stringify(session.branches || []) === JSON.stringify(nextBranches) &&
          branchOk;
        if (!same) {
          onSession({
            ...session,
            branchId: branchOk ? session.branchId : nextBranches[0]?.id,
            branches: nextBranches,
            user: { ...session.user, role: data.me.role, permissions: data.me.permissions },
            license: { ...session.license, features: nextFeatures, plan: nextPlan, seats: nextSeats },
          });
        }
      })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener("pharmacyos-badges", refresh);
    return () => window.removeEventListener("pharmacyos-badges", refresh);
  }, [session, section]);

  const items: { id: Section; label: string; badge?: number }[] = [
    { id: "today", label: "Shift" },
    { id: "register", label: "Register" },
    { id: "stock", label: "Stock", badge: badges.expired || badges.low },
    { id: "patients", label: "Clients" },
    ...(features.includes("patients") ? [{ id: "aged" as const, label: "Client aged", badge: badges.aged }] : []),
    ...(features.includes("prescriptions") ? [{ id: "prescriptions" as const, label: "Prescriptions", badge: badges.scripts }] : []),
    ...(features.includes("suppliers") ? [{ id: "suppliers" as const, label: "Suppliers" }] : []),
    ...(features.includes("suppliers") ? [{ id: "wholesalers" as const, label: "Wholesaler aged", badge: badges.wholesalers }] : []),
    ...(features.includes("suppliers") ? [{ id: "orders" as const, label: "To order", badge: badges.orders }] : []),
    ...(features.includes("reports") && allowed(session, "reports") ? [{ id: "reports" as const, label: "Reports" }] : []),
    ...(session.user.role === "owner" ? [{ id: "staff" as const, label: "Staff" }] : []),
  ];

  const initials = session.user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div aria-hidden className="pointer-events-none fixed -left-16 top-10 h-72 w-72 rounded-full bg-moss/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none fixed bottom-0 left-24 h-56 w-56 rounded-full bg-[#1a4d3a]/40 blur-3xl" />
      <aside
        className={`sticky top-4 z-30 mx-4 mt-4 flex flex-col rounded-[24px] border border-white/15 bg-[#15201c]/55 shadow-[0_24px_70px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-2xl lg:fixed lg:bottom-4 lg:left-4 lg:top-4 lg:mx-0 lg:mt-0 lg:transition-[width] lg:duration-300 ${open ? "lg:w-[240px]" : "lg:w-[76px]"}`}
      >
        <button
          type="button"
          onClick={toggleNav}
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
          className="absolute -right-3 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#15201c]/80 text-muted shadow-lg backdrop-blur hover:text-ink lg:grid"
        >
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${open ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </button>
        <div className={`flex items-center gap-3 px-3 py-4 ${open ? "" : "lg:justify-center lg:px-2"}`}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss text-lg font-bold text-[#04281c]">+</span>
          <div className={`min-w-0 ${open ? "" : "lg:hidden"}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-moss">PharmacyOS</p>
            <p className="truncate text-sm font-semibold leading-5">{session.user.tenant.name}</p>
          </div>
        </div>
        {session.license.features.includes("branches") && session.branches?.length ? (
          <label className="block px-3 pb-2">
            <span className={`text-[11px] font-semibold uppercase tracking-wide text-muted ${open ? "" : "lg:sr-only"}`}>Branch</span>
            <select
              aria-label="Branch"
              value={session.branches.some((branch) => branch.id === session.branchId) ? session.branchId : session.branches[0].id}
              onChange={(event) => onSession({ ...session, branchId: event.target.value })}
              className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-black/20 px-2 text-sm text-ink"
            >
              {session.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
        ) : null}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible">
          {items.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                title={item.label}
                onClick={() => onSection(item.id)}
                className={`relative flex h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-left text-sm ${open ? "" : "lg:justify-center lg:px-0"} ${active ? "bg-white/10 font-semibold text-mossdeep" : "text-muted hover:bg-white/5 hover:text-ink"}`}
              >
                <span className="relative">
                  <Mark section={item.id} />
                  {item.badge ? <span className={`absolute -right-1.5 -top-1 hidden h-1.5 w-1.5 rounded-full bg-[#ff8f84] ${open ? "" : "lg:block"}`} /> : null}
                </span>
                <span className={`whitespace-nowrap ${open ? "" : "lg:sr-only"}`}>{item.label}</span>
                {item.badge ? <span className={`ml-auto min-w-5 rounded-full bg-[#3a201c] px-1.5 text-center text-[11px] font-semibold text-[#ffb4ab] ${open ? "" : "lg:hidden"}`}>{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden px-2 pb-3 lg:block">
          {open ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3">
              <p className="truncate text-sm font-semibold text-ink">{session.user.name}</p>
              <p className="mt-0.5 text-xs capitalize text-muted">{session.user.role}</p>
              <p className="mt-2 text-xs capitalize text-muted">{session.license.plan} · {days} days left</p>
            </div>
          ) : (
            <div title={session.user.name} className="grid h-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-xs font-semibold text-ink">
              {initials}
            </div>
          )}
        </div>
      </aside>
      <div className={`min-w-0 transition-[padding] duration-300 ${open ? "lg:pl-[276px]" : "lg:pl-[112px]"} lg:pr-4 lg:pt-4`}>
        <header className={`flex items-center justify-between gap-4 px-4 lg:px-8 ${section === "today" ? "py-3" : "py-4 lg:pt-6"}`}>
          {section === "today" ? (
            <div />
          ) : (
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{titles[section].title}</h1>
              <p className="mt-0.5 truncate text-sm text-muted">{titles[section].detail}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <time className="hidden whitespace-nowrap text-sm tabular-nums text-muted sm:inline">
              {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
              <span className="ml-2">{now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
            </time>
            <button className="h-10 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted hover:bg-surface hover:text-ink" onClick={onSignOut}>Sign out</button>
          </div>
        </header>
        <main className="px-4 pb-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
