"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/shell";
import { api, License, when } from "@/lib/api";

type Dashboard = {
  tenants: number;
  suspended: number;
  activeLicenses: number;
  expiringSoon: number;
  recentTenants: { id: string; name: string; code: string; status: string; license: License | null }[];
  expiring: (License & { tenant: { name: string; code: string } })[];
};

export default function OverviewPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/platform/dashboard")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Overview</p>
      <h1 className="mt-1 font-serif text-4xl">Your pharmacies</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
        One deployment serves every client. A pharmacy is a tenant. When you are ready to hand the system over, download a signed license — twelve months is the usual term — and the client installs with that file.
      </p>
      {error ? <p className="mt-4 text-sm text-[#8a3b32]">{error}</p> : null}
      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        <Stat label="Pharmacies" value={data?.tenants} />
        <Stat label="Active licenses" value={data?.activeLicenses} />
        <Stat label="Expiring in 30 days" value={data?.expiringSoon} />
        <Stat label="Suspended" value={data?.suspended} />
      </div>
      <section className="mt-8 border border-line bg-white">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-medium">Recent pharmacies</h2>
          <Link href="/tenants/new" className="bg-moss px-3 py-1.5 text-sm text-white">New pharmacy</Link>
        </header>
        <table className="w-full text-left text-sm">
          <tbody>
            {data?.recentTenants.map((tenant) => (
              <tr key={tenant.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/tenants/${tenant.id}`} className="font-medium hover:underline">{tenant.name}</Link>
                  <p className="text-xs text-stone-500">{tenant.code}</p>
                </td>
                <td className="px-4 py-3"><StatusPill status={tenant.status} /></td>
                <td className="px-4 py-3 text-stone-600">
                  {tenant.license ? `${tenant.license.plan} until ${when(tenant.license.expiresAt)}` : "No license yet"}
                </td>
              </tr>
            ))}
            {data && data.recentTenants.length === 0 ? (
              <tr><td className="px-4 py-6 text-stone-500">No pharmacies yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="border border-line bg-white px-4 py-4">
      <p className="text-xs uppercase tracking-[0.14em] text-stone-500">{label}</p>
      <p className="mt-2 font-serif text-3xl">{value ?? "–"}</p>
    </div>
  );
}
