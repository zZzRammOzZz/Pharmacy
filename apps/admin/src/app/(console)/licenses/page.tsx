"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/shell";
import { api, downloadLicense, License, when } from "@/lib/api";

type Row = License & { tenant: { id: string; name: string; code: string } };

export default function LicensesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Row[]>("/platform/licenses").then(setRows).catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-stone-500">Client files</p>
      <h1 className="mt-1 font-serif text-4xl">Licenses</h1>
      <p className="mt-3 max-w-2xl text-sm text-stone-600">
        Download a <span className="font-medium">.lic</span> file for each pharmacy. The counter and the license SDK both refuse a file whose signature or expiry does not check out. Revocation is enforced by the API.
      </p>
      {error ? <p className="mt-4 text-sm text-[#8a3b32]">{error}</p> : null}
      <div className="mt-6 overflow-x-auto border border-line bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-[#faf7f1] text-xs uppercase tracking-[0.12em] text-stone-500">
            <tr>
              <th className="px-4 py-3 font-medium">Pharmacy</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Term</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((license) => (
              <tr key={license.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link href={`/tenants/${license.tenant.id}`} className="font-medium hover:underline">{license.tenant.name}</Link>
                  <p className="text-xs text-stone-500">{license.keyId}</p>
                </td>
                <td className="px-4 py-3 capitalize">{license.plan}<span className="text-stone-500"> · {license.seats} seats</span></td>
                <td className="px-4 py-3">{when(license.issuedAt)} – {when(license.expiresAt)}</td>
                <td className="px-4 py-3"><StatusPill status={license.status} /></td>
                <td className="px-4 py-3 text-right">
                  <button className="border border-line px-3 py-1.5" onClick={() => downloadLicense(license.id).catch((err) => setError(err.message))}>
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
