"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  Eye,
  FilePlus2,
  FileText,
  History,
  LogOut,
  MousePointerClick,
  PencilLine,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { supabase, getEditorRole } from "@/lib/supabase";
import { StarRating, starsFromViews } from "@/components/StarRating";
import { toPlainText } from "@/lib/richText";

type Action = "created" | "updated" | "deleted" | "reordered";

interface AuditEntry {
  id: number;
  faq_id: string | null;
  faq_code: string | null;
  action: Action;
  actor_email: string | null;
  old_data: Record<string, string> & { order?: string[] } | null;
  new_data: Record<string, string> & { order?: string[] } | null;
  created_at: string;
}

interface FaqStat {
  faq_id: string;
  faq_code: string;
  category: string;
  question: string;
  views: number;
  views_7d: number;
  last_viewed: string | null;
}

interface Totals {
  page_visits: number;
  page_visits_7d: number;
  faq_opens: number;
  faq_opens_7d: number;
}

type AuthState = "loading" | "signed-out" | "denied" | "ok";

const ACTION_STYLE: Record<Action, { label: string; className: string; Icon: typeof FilePlus2 }> = {
  created: { label: "Added", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: FilePlus2 },
  updated: { label: "Edited", className: "bg-blue-50 text-blue-700 border-blue-200", Icon: PencilLine },
  deleted: { label: "Deleted", className: "bg-red-50 text-red-700 border-red-200", Icon: Trash2 },
  reordered: { label: "Reordered", className: "bg-violet-50 text-violet-700 border-violet-200", Icon: ArrowUpDown },
};

const TRACKED_FIELDS = ["faq_code", "category", "question", "answer"] as const;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminDashboard() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [log, setLog] = useState<AuditEntry[]>([]);
  const [stats, setStats] = useState<FaqStat[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState<"all" | Action>("all");
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  const checkAccess = useCallback(async (email: string | undefined) => {
    if (!email) {
      setUserEmail(null);
      setAuthState("signed-out");
      return;
    }
    setUserEmail(email);
    const role = await getEditorRole(email);
    setAuthState(role === "super_admin" ? "ok" : "denied");
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthState("signed-out");
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => checkAccess(session?.user?.email));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      checkAccess(session?.user?.email);
    });
    return () => listener.subscription.unsubscribe();
  }, [checkAccess]);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoadingData(true);
    setDataError(null);
    const [logRes, statsRes, totalsRes] = await Promise.all([
      supabase.from("faq_audit_log").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.rpc("admin_faq_view_stats"),
      supabase.rpc("admin_view_totals"),
    ]);
    const err = logRes.error || statsRes.error || totalsRes.error;
    if (err) setDataError(err.message);
    setLog((logRes.data as AuditEntry[]) ?? []);
    setStats((statsRes.data as FaqStat[]) ?? []);
    setTotals(((totalsRes.data as Totals[]) ?? [])[0] ?? null);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    if (authState === "ok") loadData();
  }, [authState, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoggingIn(true);
    setLoginError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setLoggingIn(false);
    if (error) setLoginError(error.message);
    else setLoginPassword("");
  };

  const filteredLog = useMemo(
    () => (actionFilter === "all" ? log : log.filter((l) => l.action === actionFilter)),
    [log, actionFilter]
  );

  const actionCounts = useMemo(() => {
    const c = { created: 0, updated: 0, deleted: 0, reordered: 0 };
    log.forEach((l) => c[l.action]++);
    return c;
  }, [log]);

  const maxViews = Math.max(1, ...stats.map((s) => Number(s.views)));

  // ---------- Gate screens ----------
  if (authState !== "ok") {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-slate-900 p-2 rounded-xl">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-slate-900">Admin Dashboard</h1>
          </div>

          {authState === "loading" && <p className="text-sm text-slate-500">Checking access…</p>}

          {authState === "signed-out" &&
            (!supabase ? (
              <p className="text-sm text-slate-600">Supabase is not configured for this deployment.</p>
            ) : (
              <form onSubmit={handleLogin} className="space-y-3">
                <p className="text-sm text-slate-600">Sign in with the super admin account.</p>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="Email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="w-full bg-blue-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60"
                >
                  {loggingIn ? "Signing in…" : "Sign In"}
                </button>
                {loginError && <p className="text-xs text-red-600 font-medium">{loginError}</p>}
              </form>
            ))}

          {authState === "denied" && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-sm">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  <strong>{userEmail}</strong> does not have super admin access.
                </span>
              </div>
              <button
                onClick={() => supabase?.auth.signOut()}
                className="w-full border border-slate-300 py-2 rounded-xl text-sm font-medium hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          )}

          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to FAQs
          </Link>
        </div>
      </main>
    );
  }

  // ---------- Dashboard ----------
  const cards = [
    { label: "Portal visits", value: totals?.page_visits, sub: `${totals?.page_visits_7d ?? 0} in last 7 days`, Icon: Eye },
    { label: "FAQ opens", value: totals?.faq_opens, sub: `${totals?.faq_opens_7d ?? 0} in last 7 days`, Icon: MousePointerClick },
    { label: "Published FAQs", value: stats.length, sub: `${new Set(stats.map((s) => s.category)).size} categories`, Icon: FileText },
    {
      label: "Changes logged",
      value: log.length,
      sub: `${actionCounts.created} added · ${actionCounts.updated} edited · ${actionCounts.deleted} deleted`,
      Icon: History,
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="bg-slate-900 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2.5 rounded-xl">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-slate-300 text-sm">FAQ activity log and view statistics</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl hover:bg-slate-700"
            >
              <ArrowLeft className="w-4 h-4" /> FAQs
            </Link>
            <button
              onClick={loadData}
              disabled={loadingData}
              className="inline-flex items-center gap-1.5 text-sm bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl hover:bg-slate-700 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loadingData ? "animate-spin" : ""}`} /> Refresh
            </button>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-xl">
              <div className="text-xs">
                <div className="text-slate-200">{userEmail}</div>
                <div className="text-amber-400 font-semibold">Super Admin</div>
              </div>
              <button
                onClick={() => supabase?.auth.signOut()}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {dataError && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3">{dataError}</div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(({ label, value, sub, Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                {label}
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold mt-2 tabular-nums">
                {value === undefined ? "—" : Number(value).toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-1">{sub}</div>
            </div>
          ))}
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold">Views per FAQ</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Counted when a visitor opens an FAQ, once per browser session.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="px-5 py-2.5 font-medium">FAQ</th>
                  <th className="px-3 py-2.5 font-medium w-[35%]">Views</th>
                  <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Last 7 days</th>
                  <th className="px-5 py-2.5 font-medium whitespace-nowrap">Last viewed</th>
                </tr>
              </thead>
              <tbody>
                {stats.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-slate-500">
                      {loadingData ? "Loading…" : "No FAQs yet."}
                    </td>
                  </tr>
                )}
                {stats.map((s) => (
                  <tr key={s.faq_id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                          {s.faq_code}
                        </span>
                        <span className="text-slate-800 line-clamp-1">{s.question}</span>
                      </div>
                      <StarRating stars={starsFromViews(Number(s.views), maxViews)} className="mt-1" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${(Number(s.views) / maxViews) * 100}%` }}
                          />
                        </div>
                        <span className="tabular-nums font-semibold w-10 text-right">{Number(s.views)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{Number(s.views_7d)}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap text-xs">{formatDate(s.last_viewed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Activity log</h2>
              <p className="text-xs text-slate-500 mt-0.5">Every FAQ added, edited or deleted, newest first.</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["all", "created", "updated", "deleted", "reordered"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setActionFilter(a)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    actionFilter === a
                      ? "bg-slate-900 text-white"
                      : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {a === "all" ? `All (${log.length})` : `${ACTION_STYLE[a].label} (${actionCounts[a]})`}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-slate-100">
            {filteredLog.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-slate-500">
                {loadingData ? "Loading…" : "No activity recorded yet."}
              </li>
            )}
            {filteredLog.map((entry) => {
              const style = ACTION_STYLE[entry.action];
              const isOpen = expandedLogId === entry.id;
              const snapshot = entry.new_data ?? entry.old_data;
              const changedFields =
                entry.action === "updated"
                  ? TRACKED_FIELDS.filter((f) => entry.old_data?.[f] !== entry.new_data?.[f])
                  : [];
              return (
                <li key={entry.id}>
                  <button
                    onClick={() => setExpandedLogId(isOpen ? null : entry.id)}
                    className="w-full text-left px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50 transition"
                  >
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold border px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${style.className}`}
                    >
                      <style.Icon className="w-3.5 h-3.5" />
                      {style.label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-900">
                        {entry.action === "reordered" ? (
                          <span className="text-slate-700">FAQ display order changed</span>
                        ) : (
                          <>
                            <span className="font-mono font-semibold">{entry.faq_code}</span>
                            <span className="text-slate-600"> — {snapshot?.question}</span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        by <span className="font-medium text-slate-700">{entry.actor_email ?? "unknown"}</span> ·{" "}
                        {formatDate(entry.created_at)}
                        {changedFields.length > 0 && <> · changed {changedFields.join(", ")}</>}
                      </div>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {isOpen && entry.action === "reordered" && (
                    <div className="px-5 pb-4 grid sm:grid-cols-2 gap-3 text-xs">
                      {(
                        [
                          ["Before", entry.old_data?.order, "bg-red-50 border-red-100"],
                          ["After", entry.new_data?.order, "bg-emerald-50 border-emerald-100"],
                        ] as const
                      ).map(([title, order, cls]) => (
                        <div key={title} className={`border rounded-lg p-2.5 ${cls}`}>
                          <div className="font-semibold text-slate-700 mb-1">{title}</div>
                          <ol className="list-decimal list-inside font-mono text-slate-800 space-y-0.5">
                            {(order ?? []).map((code) => (
                              <li key={code}>{code}</li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  )}

                  {isOpen && entry.action !== "reordered" && (
                    <div className="px-5 pb-4 space-y-3">
                      {(entry.action === "updated" ? changedFields : TRACKED_FIELDS).map((field) => (
                        <div key={field} className="text-xs">
                          <div className="font-semibold text-slate-700 mb-1 capitalize">{field.replace("_", " ")}</div>
                          {entry.action === "updated" ? (
                            <div className="grid sm:grid-cols-2 gap-2">
                              <div className="bg-red-50 border border-red-100 rounded-lg p-2.5 text-red-900 whitespace-pre-wrap">
                                {toPlainText(entry.old_data?.[field], "[image]")}
                              </div>
                              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 text-emerald-900 whitespace-pre-wrap">
                                {toPlainText(entry.new_data?.[field], "[image]")}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-slate-800 whitespace-pre-wrap">
                              {toPlainText(snapshot?.[field], "[image]")}
                            </div>
                          )}
                        </div>
                      ))}
                      {entry.action === "updated" && changedFields.length === 0 && (
                        <p className="text-xs text-slate-500">Saved without changing the question or answer.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
