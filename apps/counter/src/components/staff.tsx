"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Session } from "@/lib/api";
import { StaffList } from "@/lib/types";
import { Field, Notice, Panel, PrimaryButton, control } from "./ui";

const roles = [
  ["cashier", "Cashier"],
  ["pharmacist", "Pharmacist"],
  ["manager", "Manager"],
] as const;

const access = [
  ["refund", "Refund"],
  ["mainReading", "Main reading"],
  ["reports", "Reports"],
] as const;

export function Staff({ session }: { session: Session }) {
  const [list, setList] = useState<StaffList | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState("");
  const [role, setRole] = useState("cashier");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [password, setPassword] = useState("");

  async function load() {
    setList(await api<StaffList>("/pharmacy/staff", session));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load the staff list"));
  }, [session]);

  function chooseRole(next: string) {
    setRole(next);
    if (next === "manager") setPermissions(["refund", "mainReading", "reports"]);
    else if (next === "pharmacist") setPermissions(["refund"]);
    else setPermissions([]);
  }

  function toggle(permission: string) {
    setPermissions((current) => (current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]));
  }

  function edit(person: StaffList["staff"][number]) {
    setEditing(person.id);
    setRole(person.role === "owner" ? "owner" : person.role);
    setPermissions(person.permissions);
    setPassword("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setPending(true);
    setError("");
    try {
      if (editing) {
        await api(`/pharmacy/staff/${editing}`, session, {
          method: "PATCH",
          body: JSON.stringify({ role, permissions, password: password || undefined }),
        });
      } else {
        const data = new FormData(form);
        await api("/pharmacy/staff", session, {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            password,
            role,
            permissions,
          }),
        });
        form.reset();
      }
      setEditing("");
      setPassword("");
      chooseRole("cashier");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The staff list was not saved");
    } finally {
      setPending(false);
    }
  }

  const selected = list?.staff.find((person) => person.id === editing) || null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {session.license.features.includes("branches") ? (
        <form
          className="flex items-end gap-2 rounded-[24px] bg-surface p-4 shadow-card lg:col-span-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get("branch") || "");
            setError("");
            api("/pharmacy/branches", session, { method: "POST", body: JSON.stringify({ name }) })
              .then(() => {
                event.currentTarget.reset();
                window.dispatchEvent(new Event("pharmacyos-badges"));
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Could not add the branch"));
          }}
        >
          <Field label="New branch"><input name="branch" required minLength={2} className={control} placeholder="Hamra" /></Field>
          <PrimaryButton type="submit">Add branch</PrimaryButton>
        </form>
      ) : null}
      <Panel title={list ? `${list.used} of ${list.seats} seats` : "Staff"}>
        <ul>
          {(list?.staff || []).map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0">
              <span>
                <span className="font-medium">{person.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{person.email}{person.branch ? ` · ${person.branch.name}` : ""}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-right text-xs capitalize text-muted">
                  {person.role}
                  <span className="mt-0.5 block normal-case">{person.role === "owner" ? "Full access" : accessLabel(person.permissions)}</span>
                </span>
                {person.role === "owner" ? null : (
                  <button className="h-8 rounded-sm border border-line px-2.5 text-xs" onClick={() => edit(person)}>Access</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={selected ? selected.name : "New employee"}>
        <form onSubmit={save} className="grid gap-3 p-4">
          <Notice message={error} />
          {selected ? null : (
            <>
              <Field label="Name"><input name="name" required className={control} /></Field>
              <Field label="Email"><input name="email" type="email" required className={control} /></Field>
            </>
          )}
          <Field label="Role">
            <select value={role} onChange={(event) => chooseRole(event.target.value)} className={control} disabled={selected?.role === "owner"}>
              {roles.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-muted">Access</legend>
            <div className="grid gap-1">
              {access.map(([id, label]) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={permissions.includes(id)} onChange={() => toggle(id)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={selected ? "New password" : "Password"}>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required={!selected} minLength={8} className={control} placeholder={selected ? "Leave blank to keep it" : ""} />
          </Field>
          <PrimaryButton pending={pending}>{selected ? "Save access" : "Add employee"}</PrimaryButton>
          {selected ? <button type="button" className="h-9 rounded-sm border border-line text-sm" onClick={() => { setEditing(""); chooseRole("cashier"); setPassword(""); }}>Cancel</button> : null}
        </form>
      </Panel>
    </div>
  );
}

function accessLabel(permissions: string[]) {
  const names = access.filter(([id]) => permissions.includes(id)).map(([, label]) => label);
  return names.length ? names.join(", ") : "Own reading only";
}
