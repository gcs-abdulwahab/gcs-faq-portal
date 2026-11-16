"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck, UserPlus, Users, Wand2 } from "lucide-react";
import { supabase, type FaqScope } from "@/lib/supabase";
import { useDialog } from "@/components/Dialog";

interface StaffUser {
  email: string;
  role: "editor" | "super_admin";
  has_login: boolean;
  last_sign_in_at: string | null;
  created_at: string | null;
  can_add: boolean;
  edit_scope: FaqScope;
  delete_scope: FaqScope;
  can_view_dashboard: boolean;
}

interface Perms {
  can_add: boolean;
  edit_scope: FaqScope;
  delete_scope: FaqScope;
  can_view_dashboard: boolean;
}

const ALL_PERMS: Perms = { can_add: true, edit_scope: "all", delete_scope: "all", can_view_dashboard: true };

function pickPerms(u: Perms): Perms {
  return {
    can_add: u.can_add,
    edit_scope: u.edit_scope,
    delete_scope: u.delete_scope,
    can_view_dashboard: u.can_view_dashboard,
  };
}

const SCOPES: { value: FaqScope; label: string }[] = [
  { value: "none", label: "None" },
  { value: "own", label: "Own" },
  { value: "all", label: "Any" },
];

function TogglePill({
  on,
  label,
  hint,
  disabled,
  onClick,
}: {
  on: boolean;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition disabled:opacity-60 ${
        on
          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
          : "bg-white text-slate-400 border-slate-200 line-through hover:bg-slate-50"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`} />
      {label}
    </button>
  );
}

function ScopePicker({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: FaqScope;
  disabled?: boolean;
  onChange: (v: FaqScope) => void;
}) {
  const on = value !== "none";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      title={hint}
      className={`inline-flex items-center gap-1 text-xs font-medium pl-2.5 pr-0.5 py-0.5 rounded-full border ${
        on ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-400 border-slate-200"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`} />
      <span className="mr-1">{label}</span>
      {SCOPES.map((s) => {
        const active = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(s.value)}
            title={
              s.value === "none"
                ? `Can't ${label.toLowerCase()}`
                : s.value === "own"
                  ? `${label} only FAQs they created`
                  : `${label} any FAQ`
            }
            className={`px-2 py-0.5 rounded-full transition disabled:opacity-60 ${
              active
                ? on
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-500 text-white"
                : "text-slate-500 hover:bg-white/80 hover:text-slate-800"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function PermissionControls({
  value,
  onChange,
  disabled,
}: {
  value: Perms;
  onChange: (next: Perms) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TogglePill
        on={value.can_add}
        label="Add FAQs"
        hint="Create new FAQs and publish answers to visitor questions"
        disabled={disabled}
        onClick={() => onChange({ ...value, can_add: !value.can_add })}
      />
      <ScopePicker
        label="Edit"
        hint="Which FAQs they can edit: none, only ones they created, or any"
        value={value.edit_scope}
        disabled={disabled}
        onChange={(edit_scope) => onChange({ ...value, edit_scope })}
      />
      <ScopePicker
        label="Delete"
        hint="Which FAQs they can delete: none, only ones they created, or any"
        value={value.delete_scope}
        disabled={disabled}
        onChange={(delete_scope) => onChange({ ...value, delete_scope })}
      />
      <TogglePill
        on={value.can_view_dashboard}
        label="View dashboard"
        hint="See view stats and the activity log"
        disabled={disabled}
        onClick={() => onChange({ ...value, can_view_dashboard: !value.can_view_dashboard })}
      />
    </div>
  );
}

function samePerms(a: Perms, b: Perms) {
  return (
    a.can_add === b.can_add &&
    a.edit_scope === b.edit_scope &&
    a.delete_scope === b.delete_scope &&
    a.can_view_dashboard === b.can_view_dashboard
  );
}

const MIN_PASSWORD = 8;

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

/** Random, readable password (no look-alike characters). */
function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function PasswordField({
  value,
  onChange,
  autoFocus,
  placeholder = `At least ${MIN_PASSWORD} characters`,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type={show ? "text" : "password"}
          required
          minLength={MIN_PASSWORD}
          autoFocus={autoFocus}
          autoComplete="new-password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-slate-300 rounded-xl pl-3.5 pr-10 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          title={show ? "Hide password" : "Show password"}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          onChange(generatePassword());
          setShow(true);
        }}
        title="Generate a strong password"
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 shrink-0"
      >
        <Wand2 size={15} /> Generate
      </button>
    </div>
  );
}

export function StaffAccounts({ currentEmail }: { currentEmail: string | null }) {
  const dialog = useDialog();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "editor" as StaffUser["role"] });
  const [newPerms, setNewPerms] = useState<Perms>(ALL_PERMS);
  const [savingPerms, setSavingPerms] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_users");
    setLoadError(error ? error.message : null);
    setUsers((data as StaffUser[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const email = newUser.email.trim().toLowerCase();
    const { error } = await supabase.rpc("admin_create_user", {
      p_email: email,
      p_password: newUser.password,
      p_role: newUser.role,
    });
    if (!error && newUser.role === "editor" && !samePerms(newPerms, ALL_PERMS)) {
      const res = await savePerms(email, newPerms);
      if (res.error) {
        void dialog.alert({
          title: "Account created, but permissions weren't saved",
          message: res.error.message + " The account currently has full access; adjust it in the list below.",
        });
      }
    }
    setBusy(false);
    if (error) {
      void dialog.alert({ title: "Couldn't add the account", message: error.message });
      return;
    }
    setAdding(false);
    setNewUser({ email: "", password: "", role: "editor" });
    setNewPerms(ALL_PERMS);
    load();
    void dialog.alert({
      title: "Account created",
      tone: "info",
      message: (
        <>
          <span className="font-medium text-slate-900">{email}</span> can now sign in with the password you set. Share it
          with them privately.
        </>
      ),
    });
  };

  const savePerms = (email: string, p: Perms) =>
    supabase!.rpc("admin_set_permissions", {
      p_email: email,
      p_can_add: p.can_add,
      p_edit_scope: p.edit_scope,
      p_delete_scope: p.delete_scope,
      p_can_view_dashboard: p.can_view_dashboard,
    });

  const updatePermissions = async (u: StaffUser, next: Perms) => {
    if (!supabase) return;
    setSavingPerms(u.email);
    setUsers((list) => list.map((x) => (x.email === u.email ? { ...x, ...next } : x))); // optimistic
    const { error } = await savePerms(u.email, next);
    setSavingPerms(null);
    if (error) {
      void dialog.alert({ title: "Couldn't update permissions", message: error.message });
      load();
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !resetFor) return;
    const email = resetFor;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_password", { p_email: email, p_password: resetPassword });
    setBusy(false);
    if (error) {
      void dialog.alert({ title: "Couldn't change the password", message: error.message });
      return;
    }
    setResetFor(null);
    setResetPassword("");
    load();
    const isSelf = email === currentEmail?.toLowerCase();
    void dialog.alert({
      title: "Password changed",
      tone: "info",
      message: isSelf
        ? "Your new password works from your next sign-in."
        : `${email} has been signed out of other devices and must use the new password from now on.`,
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-500" /> Staff accounts
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Add staff logins and reset their passwords.</p>
        </div>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setResetFor(null);
            }}
            className="inline-flex items-center justify-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            <UserPlus className="w-4 h-4" /> Add staff
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={addUser} className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_auto] gap-3">
            <label className="block text-xs font-semibold text-slate-700">
              Email
              <input
                type="email"
                required
                autoFocus
                autoComplete="off"
                placeholder="name@gcslahore.edu.pk"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm font-normal focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </label>
            <div className="text-xs font-semibold text-slate-700">
              Password
              <div className="mt-1">
                <PasswordField value={newUser.password} onChange={(password) => setNewUser({ ...newUser, password })} />
              </div>
            </div>
            <label className="block text-xs font-semibold text-slate-700">
              Role
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as StaffUser["role"] })}
                className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-normal bg-white"
              >
                <option value="editor">Editor</option>
                <option value="super_admin">Super admin</option>
              </select>
            </label>
          </div>
          {newUser.role === "editor" ? (
            <div className="text-xs font-semibold text-slate-700 space-y-1.5">
              Permissions
              <PermissionControls value={newPerms} onChange={setNewPerms} />
            </div>
          ) : (
            <p className="text-xs text-slate-500">Super admins always have every permission, including managing staff accounts.</p>
          )}
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create account
            </button>
          </div>
        </form>
      )}

      {loadError ? (
        <div className="m-5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3">{loadError}</div>
      ) : loading && users.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-slate-500">Loading accounts…</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {users.map((u) => {
            const isSelf = u.email.toLowerCase() === currentEmail?.toLowerCase();
            const open = resetFor === u.email;
            return (
              <li key={u.email} className="px-5 py-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900 break-all">{u.email}</span>
                      {isSelf && <span className="text-xs text-slate-500">(you)</span>}
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          u.role === "super_admin"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}
                      >
                        {u.role === "super_admin" && <ShieldCheck className="w-3 h-3" />}
                        {u.role === "super_admin" ? "Super admin" : "Editor"}
                      </span>
                      {!u.has_login && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">
                          No login yet
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Last sign-in: {formatDate(u.last_sign_in_at)}</div>
                    <div className="mt-2">
                      {u.role === "super_admin" ? (
                        <span className="text-xs text-slate-500">All permissions, including staff accounts</span>
                      ) : (
                        <PermissionControls
                          value={pickPerms(u)}
                          disabled={savingPerms === u.email}
                          onChange={(next) => updatePermissions(u, next)}
                        />
                      )}
                    </div>
                  </div>
                  {!open && (
                    <button
                      onClick={() => {
                        setResetFor(u.email);
                        setResetPassword("");
                        setAdding(false);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 self-start sm:self-auto"
                    >
                      <KeyRound className="w-4 h-4" /> {u.has_login ? "Change password" : "Set password"}
                    </button>
                  )}
                </div>

                {open && (
                  <form onSubmit={changePassword} className="mt-3 flex flex-col sm:flex-row gap-2.5 sm:items-start">
                    <div className="flex-1">
                      <PasswordField
                        autoFocus
                        value={resetPassword}
                        onChange={setResetPassword}
                        placeholder={`New password (at least ${MIN_PASSWORD} characters)`}
                      />
                    </div>
                    <div className="flex gap-2.5 justify-end">
                      <button
                        type="button"
                        onClick={() => setResetFor(null)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-60"
                      >
                        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save password
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
