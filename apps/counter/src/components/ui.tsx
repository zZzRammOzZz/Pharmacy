import { FormEvent, ReactNode } from "react";

export const control =
  "h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm placeholder:text-muted";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <p className="rounded-lg border border-[#5a2e2a] bg-[#2a1715] px-3 py-2.5 text-sm text-[#ffb4ab]">{message}</p>;
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PrimaryButton({
  children,
  pending,
  type = "submit",
  onClick,
  disabled,
}: {
  children: ReactNode;
  pending?: boolean;
  type?: "submit" | "button";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || pending}
      className="h-11 rounded-lg bg-moss px-4 text-sm font-semibold text-[#04281c] shadow-sm hover:bg-[#62d4a4] disabled:cursor-not-allowed disabled:bg-[#2c3833] disabled:text-muted"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function quietSubmit(handler: (event: FormEvent<HTMLFormElement>) => Promise<void>, setError: (message: string) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    handler(event).catch((err: unknown) => setError(err instanceof Error ? err.message : "Something went wrong"));
  };
}
