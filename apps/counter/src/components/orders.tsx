"use client";

import { useEffect, useState } from "react";
import { api, money, Session } from "@/lib/api";
import { OrderLine, OrderList } from "@/lib/types";
import { Notice, Panel } from "./ui";

export function Orders({ session }: { session: Session }) {
  const [list, setList] = useState<OrderList | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<OrderList>("/pharmacy/orders", session)
      .then(setList)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not build the order list"));
  }, [session]);

  return (
    <div className="order-sheet grid gap-4">
      <div className="only-print">
        <p className="text-xs font-medium text-muted">{session.user.tenant.name}</p>
        <h1 className="text-xl font-semibold">To order</h1>
      </div>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {list ? `${list.count} lines · ${money(list.totalCents)} at the last cost` : "Building the list…"}
        </p>
        <button
          type="button"
          className="h-10 rounded-full bg-moss px-4 text-sm font-semibold text-[#04281c] hover:bg-[#62d4a4] disabled:bg-[#2c3833] disabled:text-muted"
          disabled={!list?.count}
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
      <Notice message={error} />
      {list && list.groups.length === 0 ? <p className="text-sm text-muted">Nothing to order this morning.</p> : null}
      {list?.groups.map((group) => (
        <Panel key={group.supplierId || "none"} title={group.supplierName} action={<span className="text-sm font-semibold tabular-nums">{money(group.totalCents)}</span>}>
          <ul>
            {group.lines.map((line) => (
              <li key={line.medicineId} className="flex items-center justify-between gap-4 border-b border-line px-5 py-3 text-sm last:border-b-0">
                <span className="min-w-0">
                  <span className="font-medium">{line.name}{line.strength ? ` ${line.strength}` : ""}</span>
                  <span className="mt-0.5 block text-xs text-muted">{reasonText(line)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{line.orderQty} packs</span>
                  <span className="mt-0.5 block text-xs text-muted tabular-nums">{money(line.costCents)} · {money(line.lineCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

function reasonText(line: OrderLine) {
  const cover = line.daysCover === null ? "" : line.daysCover === 0 ? "none left at the recent pace" : `about ${line.daysCover} days left`;
  const stock = `${line.inDate} in date · reorder at ${line.reorderLevel} · ${line.sold} sold in 30 days`;
  if (line.reason === "both") return `${stock} · under the reorder level, ${cover}`;
  if (line.reason === "fast") return `${stock} · ${cover}`;
  return `${stock} · at or under the reorder level`;
}
