"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Inbox, Link2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findSimilarFaqs, type MatchableFaq } from "@/lib/similar";
import { RichTextEditor } from "@/components/RichTextEditor";
import { isBlankRichText } from "@/lib/richText";
import { useDialog } from "@/components/Dialog";

interface Submission {
  id: string;
  question: string;
  category: string | null;
  created_at: string;
}

interface Props {
  categories: string[];
  existingCodes: MatchableFaq[];
  onPublished: () => void;
  /** Approving a question publishes a new FAQ, so it needs the "add" permission. */
  canAdd: boolean;
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

export function ReviewQueue({ categories, existingCodes, onPublished, canAdd }: Props) {
  const dialog = useDialog();
  const [items, setItems] = useState<Submission[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [form, setForm] = useState({ faq_code: "", category: "", newCategory: "", question: "", answer: "" });
  const [busy, setBusy] = useState(false);
  const [referPicker, setReferPicker] = useState<string | null>(null);

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
    if (isBlankRichText(form.answer)) {
      void dialog.alert({ title: "The answer is empty", message: "Please write an answer before publishing.", tone: "info" });
      return;
    }
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
      void dialog.alert({ title: "Couldn't approve", message: error.message });
      return;
    }
    setApproving(null);
    load();
    onPublished();
  };

  const refer = async (s: Submission, faq: MatchableFaq) => {
    if (!supabase) return;
    const ok = await dialog.confirm({
      title: `Answer with ${faq.faq_code}?`,
      message: (
        <>
          The visitor will be pointed to this existing FAQ:
          <span className="block mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{faq.question}</span>
        </>
      ),
      confirmLabel: "Send FAQ",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("refer_submission", { p_id: s.id, p_faq_id: faq.id });
    if (error) void dialog.alert({ title: "Couldn't refer", message: error.message });
    setReferPicker(null);
    load();
  };

  const reject = async (s: Submission) => {
    if (!supabase) return;
    const note = await dialog.prompt({
      title: "Reject this question?",
      message: <span className="block p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{s.question}</span>,
      label: "Reason (optional, only staff will see it)",
      placeholder: "e.g. Duplicate, spam, not a university matter…",
      multiline: true,
      tone: "danger",
      confirmLabel: "Reject",
    });
    if (note === null) return;
    const { error } = await supabase.rpc("reject_submission", { p_id: s.id, p_note: note });
    if (error) void dialog.alert({ title: "Couldn't reject", message: error.message });
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
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <button
                      onClick={() => reject(s)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => setReferPicker(referPicker === s.id ? null : s.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50"
                    >
                      <Link2 className="w-3.5 h-3.5" /> Refer to FAQ
                    </button>
                    {canAdd && (
                    <button
                      onClick={() => startApprove(s)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                    >
                      <Check className="w-3.5 h-3.5" /> New Question
                    </button>
                    )}
                  </div>
                )}
              </div>

              {approving !== s.id && (() => {
                const related = findSimilarFaqs(s.question, existingCodes, 3);
                const showPicker = referPicker === s.id;
                if (related.length === 0 && !showPicker) return null;
                return (
                  <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 space-y-2">
                    {related.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-blue-900">Possibly already answered by:</p>
                        <ul className="space-y-1">
                          {related.map((f) => (
                            <li key={f.id} className="flex items-center justify-between gap-2 bg-white border border-blue-100 rounded-lg px-2.5 py-1.5">
                              <span className="text-xs text-slate-800 min-w-0 truncate">
                                <span className="font-mono font-semibold mr-1.5">{f.faq_code}</span>
                                {f.question}
                              </span>
                              <button
                                onClick={() => refer(s, f)}
                                className="text-xs font-medium text-blue-700 hover:underline shrink-0"
                              >
                                Refer
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {showPicker && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const f = existingCodes.find((x) => x.id === e.target.value);
                          if (f) refer(s, f);
                          e.target.value = "";
                        }}
                        className="w-full border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                      >
                        <option value="" disabled>
                          Choose any FAQ to refer to...
                        </option>
                        {existingCodes.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.faq_code} — {f.question}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })()}

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
                  <div className="text-xs font-semibold text-slate-700">
                    Answer
                    <div className="mt-1 font-normal">
                      <RichTextEditor
                        autoFocus
                        placeholder="Write the official answer..."
                        value={form.answer}
                        onChange={(html) => setForm({ ...form, answer: html })}
                      />
                    </div>
                  </div>
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
                      {busy ? "Publishing..." : "Publish as New FAQ"}
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
