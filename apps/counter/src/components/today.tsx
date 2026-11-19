"use client";

import { useEffect, useState } from "react";
import { api, money, Session, when } from "@/lib/api";
import { Bootstrap, Section } from "@/lib/types";
import { Notice, Panel } from "./ui";

export function Today({ session, onSection }: { session: Session; onSection: (section: Section) => void }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Bootstrap>("/pharmacy/bootstrap", session).then(setData).catch((err: Error) => setError(err.message));
  }, [session]);

  if (error) return <Notice message={error} />;
  if (!data) return <p className="text-sm text-muted">Loading the shift…</p>;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Takings today" value={money(data.salesToday.totalCents)} />
        <Stat label="Receipts" value={String(data.salesToday.count)} />
        <Stat label="Scripts waiting" value={String(data.pendingPrescriptions)} />
        <Stat label="Clients on file" value={String(data.patientCount)} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Reorder" action={<TextButton onClick={() => onSection("stock")}>Open stock</TextButton>}>
          {data.lowStock.length === 0 ? <Empty>Every line is above its reorder level.</Empty> : null}
          <ul>
            {data.lowStock.map((medicine) => (
              <li key={medicine.id} className="flex items-center justify-between border-b border-line px-4 py-3 text-sm last:border-b-0">
                <span>
                  <span className="font-medium">{medicine.name}</span>
                  <span className="ml-2 text-xs text-stone-500">{medicine.sku}</span>
                </span>
                <span className="tabular-nums text-[#8a3b32]">{medicine.onHand} left</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Expiry" action={<TextButton onClick={() => onSection("stock")}>Open waste</TextButton>}>
          {data.expired.length === 0 && data.expiring.length === 0 ? <Empty>No batches are expired or due within 90 days.</Empty> : null}
          <ul>
            {data.expired.map((batch) => (
              <li key={batch.id} className="flex items-center justify-between border-b border-line px-4 py-3 text-sm last:border-b-0">
                <span>
                  <span className="font-medium">{batch.medicine}</span>
                  <span className="ml-2 text-xs text-[#8d332c]">Expired</span>
                </span>
                <span className="tabular-nums text-[#8d332c]">{when(batch.expiryDate)} · {batch.quantity}</span>
              </li>
            ))}
            {data.expiring.map((batch) => (
              <li key={batch.id} className="flex items-center justify-between border-b border-line px-4 py-3 text-sm last:border-b-0">
                <span>
                  <span className="font-medium">{batch.medicine}</span>
                  <span className="ml-2 text-xs text-stone-500">{batch.batchNumber}</span>
                </span>
                <span className={batch.expiryStatus === "critical" ? "text-[#8a5a12]" : "text-stone-600"}>{when(batch.expiryDate)} · {batch.quantity}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button className="h-9 rounded-sm bg-moss px-3.5 text-sm font-medium text-white" onClick={() => onSection("register")}>Open register</button>
        {session.license.features.includes("prescriptions") ? (
          <button className="h-9 rounded-sm border border-line bg-white px-3.5 text-sm" onClick={() => onSection("prescriptions")}>Prescription queue</button>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-line bg-white px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="px-4 py-6 text-sm text-stone-500">{children}</p>;
}

function TextButton({ children, onClick }: { children: string; onClick: () => void }) {
  return <button className="text-xs font-medium text-moss" onClick={onClick}>{children}</button>;
}
