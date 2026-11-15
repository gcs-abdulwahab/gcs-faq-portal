"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Inbox, Link2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findSimilarFaqs, type MatchableFaq } from "@/lib/similar";

interface Submission {
  id: string;
  question: string;
  category: string | null;
  created_at: string;
}

interface Props {
  categories: string[];
  existingCodes: { faq_code: string; category: string }[];
  onPublished: () => void;
}

// Suggest the next code for a category, e.g. REG-06 -> REG-07, or LIB-01 for a new "Library" category.
function suggestCode(category: string, existing: Props["existingCodes"]) {
  const inCat = existing.filter((f) => f.category === category);
  const prefixes = inCat.map((f) => f.faq_code.split("-")[0]).filter(Boolean);
  const prefix =
    prefixes.sort((a, b) => prefixes.filter((p) => p === b).length - prefixes.filter((p) => p === a).length)[0] ||
    category.replace(/[^A-Za-z ]/g, "").trim().slice(0, 3).toUpperCase() ||
    "GEN";
  const used = existing
    .filter((f) => f.faq_code.startsWith(prefix + "-"))
    .map((f) => parseInt(f.faq_code.slice(prefix.length + 1), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}-${String(next).padStart(2, "0")}`;
}

export function ReviewQueue({ categories, existingCodes, onPublished }: Props) {
  const [items, setItems] = useState<Submission[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [form, setForm] = useState({ faq_code: "", category: "", newCategory: "", question: "", answer: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("faq_submissions")
      .select("id, question, category, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setItems((data as Submission[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startApprove = (s: Submission) => {
    const cat = s.category && categories.includes(s.category) ? s.category : categories[0] || "";
    setApproving(s.id);
    setForm({
      faq_code: suggestCode(cat, existingCodes),
      category: cat,
      newCategory: "",
      question: s.question,
      answer: "",
    });
  };

  const changeCategory = (cat: string) => {
    setForm((f) => ({
      ...f,
      category: cat,
      faq_code: cat === "__NEW__" ? f.faq_code : suggestCode(cat, existingCodes),
    }));
  };

  const approve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !approving) return;
    const category = form.category === "__NEW__" ? form.newCategory.trim() : form.category;
    setBusy(true);
    const { error } = await supabase.rpc("approve_submission", {
      p_id: approving,
      p_faq_code: form.faq_code,
      p_category: category,
      p_question: form.question,
      p_answer: form.answer,
    });
    setBusy(false);
    if (error) {
      alert("Could not approve: " + error.message);
      return;
    }
    setApproving(null);
    load();
    onPublished();
  };

  const reject = async (s: Submission) => {
    if (!supabase) return;
    const note = prompt(`Reject this question?\n\n"${s.question}"\n\nOptional reason (only staff will see it):`);
    if (note === null) return;
    const { error } = await supabase.rpc("reject_submission", { p_id: s.id, p_note: note });
    if (error) alert("Could not reject: " + error.message);
    load();
  };

  return (
    <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-amber-50 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-amber-950">
          <Inbox className="w-4 h-4" />
          Questions waiting for review
          <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full tabular-nums">
            {items.length}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-amber-700 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <ul className="divide-y divide-slate-100">
          {items.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">No questions waiting. 🎉</li>}
          {items.map((s) => (
            <li key={s.id} className="px-5 py-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{s.question}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {s.category ? `Suggested office: ${s.category}` : "Office not specified"} ·{" "}
                    {new Date(s.created_at).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {approving !== s.id && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => reject(s)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => startApprove(s)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                  </div>
                )}
              </div>

              {approving === s.id && (
                <form onSubmit={approve} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="text-xs font-semibold text-slate-700">
                      FAQ Code
                      <input
                        required
                        value={form.faq_code}
                        onChange={(e) => setForm({ ...form, faq_code: e.target.value })}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-normal bg-white"
                      />
                    </label>
                    <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                      Category
                      <select
                        value={form.category}
                        onChange={(e) => changeCategory(e.target.value)}
                        className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-normal bg-white"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__NEW__">+ New category...</option>
                      </select>
                    </label>
                  </div>
                  {form.category === "__NEW__" && (
                    <input
                      required
                      placeholder="New category name, e.g. Library"
                      value={form.newCategory}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          newCategory: e.target.value,
                          faq_code: suggestCode(e.target.value, existingCodes),
                        })
                      }
                      className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                    />
                  )}
                  <label className="block text-xs font-semibold text-slate-700">
                    Question (you can tidy the wording)
                    <input
                      required
                      value={form.question}
                      onChange={(e) => setForm({ ...form, question: e.target.value })}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-normal bg-white"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Answer
                    <textarea
                      required
                      rows={4}
                      autoFocus
                      placeholder="Write the official answer..."
                      value={form.answer}
                      onChange={(e) => setForm({ ...form, answer: e.target.value })}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-normal bg-white"
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setApproving(null)}
                      className="px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy ? "Publishing..." : "Approve & Publish"}
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
