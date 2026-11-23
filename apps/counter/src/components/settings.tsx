"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Session } from "@/lib/api";
import { PharmacySettings } from "@/lib/types";
import { Staff } from "./staff";
import { Field, Notice, Panel, PrimaryButton, control } from "./ui";

export function Settings({ session, onSession }: { session: Session; onSession: (session: Session) => void }) {
  const [settings, setSettings] = useState<PharmacySettings | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [pharmacyRate, setPharmacyRate] = useState("");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [roles, setRoles] = useState<PharmacySettings["roles"]>([]);
  const [capabilities, setCapabilities] = useState<PharmacySettings["capabilities"]>([]);
  const [roleName, setRoleName] = useState("");
  const [staffStamp, setStaffStamp] = useState(0);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState<"pharmacy" | "rate" | "roles" | "">("");

  useEffect(() => {
    api<PharmacySettings>("/pharmacy/settings", session)
      .then((data) => {
        setSettings(data);
        setName(data.pharmacy.name);
        setEmail(data.pharmacy.email || "");
        setPhone(data.pharmacy.phone || "");
        setAddress(data.pharmacy.address || "");
        setPharmacyRate(data.pharmacy.llPerUsd ? String(data.pharmacy.llPerUsd) : "");
        const next: Record<string, string> = {};
        for (const branch of data.branches) next[branch.id] = branch.llPerUsd ? String(branch.llPerUsd) : "";
        setRates(next);
        setRoles(data.roles || []);
        setCapabilities(data.capabilities || []);
      })
      .catch((err: Error) => setError(err.message));
  }, [session]);

  async function savePharmacy(event: FormEvent) {
    event.preventDefault();
    setPending("pharmacy");
    setError("");
    setSaved("");
    try {
      const data = await api<PharmacySettings>("/pharmacy/settings", session, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          address: address.trim() || null,
        }),
      });
      setSettings(data);
      onSession({ ...session, user: { ...session.user, tenant: { ...session.user.tenant, name: data.pharmacy.name } } });
      setSaved("Pharmacy saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The pharmacy was not saved");
    } finally {
      setPending("");
    }
  }

  async function saveRate(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setPending("rate");
    setError("");
    setSaved("");
    try {
      const body = rateBody(settings, rates, pharmacyRate);
      const data = await api<PharmacySettings>("/pharmacy/settings", session, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSettings(data);
      setSaved("Rate saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The rate was not saved");
    } finally {
      setPending("");
    }
  }

  function toggleRole(roleId: string, capability: string) {
    setRoles((current) => current.map((role) => {
      if (role.id !== roleId) return role;
      const access = role.access.includes(capability) ? role.access.filter((item) => item !== capability) : [...role.access, capability];
      return { ...role, access };
    }));
  }

  function addRole() {
    const label = roleName.trim();
    if (label.length < 2) {
      setError("Give the role a name.");
      return;
    }
    if (roles.some((role) => role.label.toLowerCase() === label.toLowerCase())) {
      setError("That role already exists.");
      return;
    }
    setRoles((current) => [...current, { id: roleId(label, new Set(current.map((role) => role.id))), label, access: [], enabled: true, custom: true }]);
    setRoleName("");
    setError("");
    setSaved("");
  }

  async function saveRoles(event: FormEvent) {
    event.preventDefault();
    setPending("roles");
    setError("");
    setSaved("");
    try {
      const data = await api<PharmacySettings>("/pharmacy/settings", session, {
        method: "PATCH",
        body: JSON.stringify({
          roles: roles.map((role) => ({ role: role.id, label: role.label, access: role.access, enabled: role.enabled })),
        }),
      });
      setSettings(data);
      setRoles(data.roles);
      setStaffStamp((stamp) => stamp + 1);
      setSaved("Roles saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The roles were not saved");
    } finally {
      setPending("");
    }
  }

  if (!settings && !error) return <p className="text-sm text-muted">Loading settings…</p>;

  return (
    <div className="grid gap-5">
      <Notice message={error} />
      {saved ? <p className="text-sm text-mossdeep">{saved}</p> : null}
      {settings ? (
        <>
          <form onSubmit={savePharmacy}>
            <Panel title="Pharmacy">
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} className={control} /></Field>
                <Field label="Sign-in code"><input value={settings.pharmacy.code} readOnly className={`${control} text-muted`} /></Field>
                <Field label="Phone"><input value={phone} onChange={(event) => setPhone(event.target.value)} className={control} /></Field>
                <Field label="Email"><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className={control} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Address"><input value={address} onChange={(event) => setAddress(event.target.value)} className={control} /></Field>
                </div>
                <div className="sm:col-span-2">
                  <PrimaryButton pending={pending === "pharmacy"}>Save pharmacy</PrimaryButton>
                </div>
              </div>
            </Panel>
          </form>
          <form onSubmit={saveRate}>
            <Panel title="Lira rate">
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <p className="text-sm text-muted sm:col-span-2">How many lira equal one dollar. The till uses this when someone pays in lira.</p>
                {settings.branches.length ? (
                  settings.branches.map((branch) => (
                    <Field key={branch.id} label={branch.name}>
                      <input
                        value={rates[branch.id] || ""}
                        inputMode="numeric"
                        onChange={(event) => setRates((current) => ({ ...current, [branch.id]: event.target.value.replace(/[^\d]/g, "") }))}
                        className={control}
                        placeholder="89500"
                      />
                    </Field>
                  ))
                ) : (
                  <Field label="Lira per dollar">
                    <input
                      value={pharmacyRate}
                      inputMode="numeric"
                      onChange={(event) => setPharmacyRate(event.target.value.replace(/[^\d]/g, ""))}
                      className={control}
                      placeholder="89500"
                    />
                  </Field>
                )}
                <div className="sm:col-span-2">
                  <PrimaryButton pending={pending === "rate"}>Save rate</PrimaryButton>
                </div>
              </div>
            </Panel>
          </form>
        </>
      ) : null}
      <form onSubmit={saveRoles}>
        <Panel title="Roles">
          <div className="grid gap-4 p-5">
            <p className="text-sm text-muted">The owner keeps full access. Everyone else follows the role you set here. Turn a role off to keep people with it out of the counter. Add a role when the four starting ones are not enough.</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-52 flex-1">
                <Field label="New role">
                  <input
                    value={roleName}
                    onChange={(event) => setRoleName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addRole();
                    }}
                    className={control}
                    placeholder="Night cashier"
                    maxLength={40}
                  />
                </Field>
              </div>
              <button type="button" className="h-10 rounded-lg border border-line px-3 text-sm" onClick={addRole}>Add role</button>
            </div>
            {roles.map((role) => (
              <fieldset key={role.id} className={`grid gap-2 border-t border-line pt-4 ${role.enabled ? "" : "opacity-70"}`}>
                <legend className="flex w-full items-center justify-between gap-3 text-sm font-semibold">
                  <span>{role.label}</span>
                  <span className="flex items-center gap-3 font-normal">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={role.enabled}
                        onChange={() => setRoles((current) => current.map((item) => item.id === role.id ? { ...item, enabled: !item.enabled } : item))}
                      />
                      On
                    </label>
                    {role.custom ? (
                      <button type="button" className="text-xs text-muted underline" onClick={() => setRoles((current) => current.filter((item) => item.id !== role.id))}>Remove</button>
                    ) : null}
                  </span>
                </legend>
                {role.enabled ? null : <p className="text-sm text-muted">People with this role see a closed counter until you turn it back on.</p>}
                <div className="grid gap-2 sm:grid-cols-2">
                  {capabilities.map((capability) => (
                    <label key={capability.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={role.access.includes(capability.id)} onChange={() => toggleRole(role.id, capability.id)} />
                      {capability.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <PrimaryButton pending={pending === "roles"}>Save roles</PrimaryButton>
          </div>
        </Panel>
      </form>
      <div className="grid gap-3">
        <h2 className="text-sm font-semibold">Employees</h2>
        <Staff key={staffStamp} session={session} />
      </div>
    </div>
  );
}

function roleId(label: string, taken: Set<string>) {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24);
  let id = /^[a-z]/.test(base) ? base : `role${base}`;
  if (id.length < 2) id = "role";
  let next = id;
  let count = 2;
  while (taken.has(next) || next === "owner") {
    next = `${id.slice(0, 28)}${count}`;
    count += 1;
  }
  return next;
}

function rateBody(settings: PharmacySettings, rates: Record<string, string>, pharmacyRate: string) {
  if (!settings.branches.length) {
    const llPerUsd = Number(pharmacyRate);
    if (!Number.isInteger(llPerUsd) || llPerUsd < 1) throw new Error("Enter how many lira equal one dollar.");
    return { llPerUsd };
  }
  const next = settings.branches
    .filter((branch) => rates[branch.id]?.trim())
    .map((branch) => ({ branchId: branch.id, llPerUsd: Number(rates[branch.id]) }));
  if (!next.length || next.some((rate) => !Number.isInteger(rate.llPerUsd) || rate.llPerUsd < 1)) {
    throw new Error("Enter how many lira equal one dollar.");
  }
  return { rates: next };
}
