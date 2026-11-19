"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Overview" },
  { href: "/tenants", label: "Pharmacies" },
  { href: "/licenses", label: "Licenses" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("pharmacyos_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    const raw = localStorage.getItem("pharmacyos_user");
    if (raw) setEmail(JSON.parse(raw).email || "");
    setReady(true);
  }, [router]);

  if (!ready) return <div className="min-h-screen bg-paper" />;

  return (
    <div className="min-h-screen bg-paper md:flex">
      <aside className="border-b border-line bg-panel px-5 py-5 md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-moss text-sm font-semibold text-white">Rx</span>
          <div>
            <p className="font-serif text-lg leading-none">PharmacyOS</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-500">Control</p>
          </div>
        </div>
        <nav className="mt-6 flex gap-2 md:mt-8 md:flex-col">
          {links.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm ${active ? "bg-[#efe8da] font-medium text-ink" : "text-stone-600 hover:bg-[#efe8da]"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 hidden text-xs text-stone-500 md:block">
          <p>{email}</p>
          <button
            className="mt-2 underline"
            onClick={() => {
              localStorage.removeItem("pharmacyos_token");
              localStorage.removeItem("pharmacyos_user");
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex justify-end px-5 pt-3 md:hidden">
          <button
            className="text-xs text-stone-500 underline"
            onClick={() => {
              localStorage.removeItem("pharmacyos_token");
              localStorage.removeItem("pharmacyos_user");
              router.replace("/login");
            }}
          >
            Sign out
          </button>
        </div>
        <main className="px-5 py-5 md:px-10 md:py-8">{children}</main>
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-[#e5f2ea] text-mossdeep"
      : status === "suspended" || status === "revoked"
        ? "bg-[#f3e4e1] text-[#8a3b32]"
        : "bg-[#f3ead2] text-[#7a5b16]";
  return <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${tone}`}>{status}</span>;
}
