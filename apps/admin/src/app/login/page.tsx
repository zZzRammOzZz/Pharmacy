"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@pharmacyos.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = await api<{ accessToken: string; user: { email: string; name: string } }>("/platform/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("pharmacyos_token", result.accessToken);
      localStorage.setItem("pharmacyos_user", JSON.stringify(result.user));
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <form onSubmit={onSubmit} className="w-full max-w-md border border-line bg-panel p-8 shadow-[0_20px_50px_rgba(60,40,10,0.05)]">
        <p className="text-xs uppercase tracking-[0.18em] text-stone-500">PharmacyOS</p>
        <h1 className="mt-2 font-serif text-3xl">Owner sign in</h1>
        <p className="mt-2 text-sm text-stone-600">This console is for you. Each pharmacy gets its own tenant and a license file.</p>
        <label className="mt-6 block text-sm">
          Email
          <input className="mt-1 w-full border border-line px-3 py-2" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input className="mt-1 w-full border border-line px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="mt-4 text-sm text-[#8a3b32]">{error}</p> : null}
        <button className="mt-6 w-full bg-moss px-4 py-2.5 text-sm font-medium text-white hover:bg-mossdeep" disabled={pending}>
          {pending ? "Signing in..." : "Enter control"}
        </button>
      </form>
    </div>
  );
}
