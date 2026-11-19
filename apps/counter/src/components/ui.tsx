import { FormEvent, ReactNode } from "react";

export const control =
  "h-9 w-full rounded-sm border border-line bg-white px-2.5 text-sm text-ink placeholder:text-stone-400";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Notice({ message }: { message: string }) {
  if (!message) return null;
  return <p className="rounded-sm border border-[#efd0cc] bg-[#fdf6f5] px-3 py-2 text-sm text-[#8d332c]">{message}</p>;
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-sm border border-line bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
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
      className="h-9 rounded-sm bg-moss px-3.5 text-sm font-medium text-white hover:bg-[#0c5a40] disabled:cursor-not-allowed disabled:bg-stone-300"
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
