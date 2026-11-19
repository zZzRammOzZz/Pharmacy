"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/shell";
import { api, License, when } from "@/lib/api";

type TenantRow = {
  id: string;
  name: string;
  code: string;
  status: string;
  email: string | null;
  users: number;
  medicines: number;
  license: License | null;
};

export default function TenantsPage() {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<TenantRow[]>("/platform/tenants").then(setRows).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Tenants</p>
          <h1 className="mt-1 font-serif text-4xl">Pharmacies</h1>
        </div>
        <Link href="/tenants/new" className="bg-moss px-4 py-2 text-sm text-white">New pharmacy</Link>
      </div>
      {error ? <p className="mt-4 text-sm text-[#8a3b32]">{error}</p> : null}
      <div className="mt-6 overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-[#faf7f1] text-xs uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Pharmacy</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">License</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Medicines</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tenant) => (
              <tr key={tenant.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/tenants/${tenant.id}`} className="font-medium hover:underline">{tenant.name}</Link>
                  <p className="text-xs text-stone-500">{tenant.code}</p>
                </td>
                <td className="px-4 py-3"><StatusPill status={tenant.status} /></td>
                <td className="px-4 py-3">
                  {tenant.license ? (
                    <span>{tenant.license.plan} · {when(tenant.license.expiresAt)}</span>
                  ) : (
                    <span className="text-stone-500">Not issued</span>
                  )}
                </td>
                <td className="px-4 py-3">{tenant.users}</td>
                <td className="px-4 py-3">{tenant.medicines}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
