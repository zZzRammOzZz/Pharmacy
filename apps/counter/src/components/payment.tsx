"use client";

import { lira, liraOf } from "@/lib/api";
import { control } from "./ui";

export const paymentMethods = [
  ["cash_usd", "Cash USD"],
  ["cash_ll", "Cash LL"],
  ["card", "Card"],
  ["credit", "Credit"],
] as const;

export function PaymentChoice({
  method,
  onMethod,
  rate,
  onRate,
  onRateCommit,
  totalCents,
  allowCredit,
}: {
  method: string;
  onMethod: (method: string) => void;
  rate: string;
  onRate: (rate: string) => void;
  onRateCommit?: (rate: string) => void;
  totalCents: number;
  allowCredit: boolean;
}) {
  const parsed = Number(rate);
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-muted">Payment</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {paymentMethods.map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={id === "credit" && !allowCredit}
            onClick={() => onMethod(id)}
            className={`h-10 rounded-lg border text-sm ${method === id ? "border-moss bg-[#1a3329] font-semibold text-mossdeep" : "border-line bg-surface text-ink"} disabled:cursor-not-allowed disabled:text-[#66756e]`}
          >
            {label}
          </button>
        ))}
      </div>
      {method === "credit" && !allowCredit ? <p className="mt-1 text-xs text-muted">Choose a client to put this on account.</p> : null}
      {method === "cash_ll" ? (
        <label className="mt-2 block text-xs font-medium text-muted">
          Lira per dollar
          <input
            value={rate}
            inputMode="numeric"
            onChange={(event) => onRate(event.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => onRateCommit?.(rate)}
            className={`${control} mt-1`}
            placeholder="89500"
          />
          {parsed > 0 && totalCents > 0 ? <span className="mt-1 block font-normal text-muted">Collect {lira(liraOf(totalCents, parsed))} LL</span> : <span className="mt-1 block font-normal text-muted">Set the rate before taking lira.</span>}
        </label>
      ) : null}
      {method === "credit" && allowCredit ? <p className="mt-1 text-xs text-muted">This stays on the client’s account until they pay it.</p> : null}
    </div>
  );
}
