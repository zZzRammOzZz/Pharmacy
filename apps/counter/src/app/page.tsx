"use client";

import { useEffect, useState } from "react";
import { loadSession, Session } from "@/lib/api";
import { Section } from "@/lib/types";
import { Login } from "@/components/login";
import { Patients } from "@/components/patients";
import { Prescriptions } from "@/components/prescriptions";
import { Register } from "@/components/register";
import { Shell } from "@/components/shell";
import { Stock } from "@/components/stock";
import { Suppliers } from "@/components/suppliers";
import { Today } from "@/components/today";

export default function CounterPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>("today");

  useEffect(() => {
    setSession(loadSession());
    setReady(true);
  }, []);

  if (!ready) return <div className="min-h-screen bg-paper" />;
  if (!session) return <Login onSuccess={setSession} />;

  return (
    <Shell
      session={session}
      section={section}
      onSection={setSection}
      onSignOut={() => {
        localStorage.removeItem("pharmacyos_counter");
        setSession(null);
      }}
    >
      {section === "today" ? <Today session={session} onSection={setSection} /> : null}
      {section === "register" ? <Register session={session} /> : null}
      {section === "stock" ? <Stock session={session} /> : null}
      {section === "patients" ? <Patients session={session} /> : null}
      {section === "prescriptions" ? <Prescriptions session={session} /> : null}
      {section === "suppliers" ? <Suppliers session={session} /> : null}
    </Shell>
  );
}
