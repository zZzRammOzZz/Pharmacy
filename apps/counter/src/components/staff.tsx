"use client";

import { FormEvent, useEffect, useState } from "react";
import { api, Session } from "@/lib/api";
import { StaffList } from "@/lib/types";
import { Dialog, Field, Notice, Panel, PrimaryButton, control, newButton } from "./ui";

const access = [
  ["register", "Register"],
  ["refund", "Refund and replace"],
  ["shift", "Shift"],
  ["mainReading", "Whole till"],
  ["purchases", "Goods in"],
  ["stock", "Catalog, counts, and waste"],
  ["corrections", "Correct a delivery or write-off"],
  ["clients", "Clients"],
  ["clientAged", "Client aged"],
  ["prescriptions", "Prescriptions"],
  ["suppliers", "Suppliers"],
  ["wholesalers", "Wholesaler aged"],
  ["orders", "To order"],
  ["reports", "Reports"],
] as const;

export function Staff({ session }: { session: Session }) {
  const [list, setList] = useState<StaffList | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState("");
  const [creating, setCreating] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [role, setRole] = useState("cashier");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [password, setPassword] = useState("");

  async function load() {
    setList(await api<StaffList>("/pharmacy/staff", session));
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Could not load the staff list"));
  }, [session]);

  function edit(person: StaffList["staff"][number]) {
    setEditing(person.id);
    setRole(person.role === "owner" ? "owner" : person.role);
    setBranchIds(person.branches?.map((branch) => branch.id) || []);
    setPassword("");
    setError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (list?.places.length && !branchIds.length) {
      setError("Choose at least one branch.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const branches = list?.places.length ? { branchIds } : {};
      if (editing) {
        await api(`/pharmacy/staff/${editing}`, session, {
          method: "PATCH",
          body: JSON.stringify({ role, password: password || undefined, ...branches }),
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
            ...branches,
          }),
        });
        form.reset();
      }
      setEditing("");
      setCreating(false);
      setPassword("");
      setRole("cashier");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The staff list was not saved");
    } finally {
      setPending(false);
    }
  }

  const selected = list?.staff.find((person) => person.id === editing) || null;
  const choices = (list?.roles || []).filter((item) => item.enabled || item.id === role);
  function roleName(id: string) {
    if (id === "owner") return "Owner";
    return list?.roles.find((item) => item.id === id)?.label || id;
  }

  function placeLabel(person: StaffList["staff"][number]) {
    if (!list?.places.length) return "";
    if (person.role === "owner") return "All branches";
    return person.branches.map((branch) => branch.name).join(", ");
  }

  function toggleBranch(id: string) {
    setBranchIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function closeStaff() {
    setCreating(false);
    setEditing("");
    setPassword("");
    setRole("cashier");
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Notice message={creating || selected || branchOpen ? "" : error} />
        <div className="ml-auto flex gap-2">
          {session.license.features.includes("branches") ? (
            <button type="button" className={newButton} onClick={() => { setBranchOpen(true); setError(""); }}>New branch</button>
          ) : null}
          <button type="button" className={newButton} onClick={() => { setCreating(true); setEditing(""); setPassword(""); setRole(list?.roles.find((item) => item.enabled)?.id || "cashier"); setBranchIds(session.branchId && list?.places.some((place) => place.id === session.branchId) ? [session.branchId] : list?.places[0] ? [list.places[0].id] : []); setError(""); }}>New</button>
        </div>
      </div>
      <Panel title={list ? `${list.used} of ${list.seats} seats` : "Staff"}>
        <ul>
          {(list?.staff || []).map((person) => (
            <li key={person.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0">
              <span>
                <span className="font-medium">{person.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{[person.email, placeLabel(person)].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="text-right text-xs capitalize text-muted">
                  {roleName(person.role)}
                  <span className="mt-0.5 block normal-case">{person.role === "owner" ? "Full access" : accessLabel(person.permissions)}</span>
                </span>
                {person.role === "owner" ? null : (
                  <button className="h-8 rounded-sm border border-line px-2.5 text-xs" onClick={() => { setCreating(false); edit(person); }}>Edit</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
      {branchOpen ? (
        <Dialog title="New branch" onClose={() => setBranchOpen(false)}>
          <form
            className="grid gap-3 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get("branch") || "");
              setError("");
              api("/pharmacy/branches", session, { method: "POST", body: JSON.stringify({ name }) })
                .then(() => {
                  setBranchOpen(false);
                  window.dispatchEvent(new Event("pharmacyos-badges"));
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Could not add the branch"));
            }}
          >
            <Notice message={error} />
            <Field label="Branch"><input name="branch" required minLength={2} className={control} placeholder="Hamra" /></Field>
            <PrimaryButton type="submit">Add branch</PrimaryButton>
          </form>
        </Dialog>
      ) : null}
      {creating || selected ? (
        <Dialog title={selected ? selected.name : "New employee"} onClose={closeStaff}>
          <form onSubmit={save} className="grid gap-3 p-4">
            <Notice message={error} />
            {selected ? null : (
              <>
                <Field label="Name"><input name="name" required className={control} /></Field>
                <Field label="Email"><input name="email" type="email" required className={control} /></Field>
              </>
            )}
            <Field label="Role">
              <select value={role} onChange={(event) => setRole(event.target.value)} className={control} disabled={selected?.role === "owner"}>
                {choices.map((item) => <option key={item.id} value={item.id}>{item.enabled ? item.label : `${item.label} (off)`}</option>)}
              </select>
            </Field>
            <p className="text-sm text-muted">What this role can open is chosen under Roles.</p>
            {list?.places.length ? (
              <fieldset>
                <legend className="mb-1 text-xs font-medium text-muted">Branches</legend>
                <div className="grid gap-1">
                  {list.places.map((place) => (
                    <label key={place.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={branchIds.includes(place.id)} onChange={() => toggleBranch(place.id)} />
                      {place.name}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted">One branch keeps them there. Tick more than one and they can switch between those branches.</p>
              </fieldset>
            ) : null}
            <Field label={selected ? "New password" : "Password"}>
              <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required={!selected} minLength={8} className={control} placeholder={selected ? "Leave blank to keep it" : ""} />
            </Field>
            <PrimaryButton pending={pending}>{selected ? "Save" : "Add employee"}</PrimaryButton>
          </form>
        </Dialog>
      ) : null}
    </div>
  );
}

function accessLabel(permissions: string[]) {
  const names = access.filter(([id]) => permissions.includes(id)).map(([, label]) => label);
  return names.length ? names.join(", ") : "Nothing open";
}
