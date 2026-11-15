"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, HelpCircle, Link2, MessageCirclePlus, Send, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { findSimilarFaqs, type MatchableFaq } from "@/lib/similar";
import { RichText } from "@/components/RichText";

const STORAGE_KEY = "gcs-faq-my-questions";

function readMyIds(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveMyId(id: string) {
  try {
    const ids = [id, ...readMyIds().filter((x) => x !== id)].slice(0, 50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable: the question is still submitted, it just can't be tracked here.
  }
}

interface MySubmission {
  id: string;
  question: string;
  status: "pending" | "approved" | "referred" | "rejected";
  created_at: string;
  faq_id: string | null;
  faq_code: string | null;
  faq_question: string | null;
  faq_answer: string | null;
}

interface Props {
  categories: string[];
  faqs: MatchableFaq[];
  prefill?: string;
  onOpenFaq: (id: string) => void;
}

export function AskQuestion({ categories, faqs, prefill = "", onOpenFaq }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("");
  const [confirmedNotListed, setConfirmedNotListed] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [mine, setMine] = useState<MySubmission[]>([]);

  const loadMine = useCallback(async () => {
    if (!supabase) return;
    const ids = readMyIds();
    if (ids.length === 0) {
      setMine([]);
      return;
    }
    const { data } = await supabase.rpc("get_submission_status", { p_ids: ids });
    setMine((data as MySubmission[]) ?? []);
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  const similar = useMemo(
    () => (question.trim().length >= 8 ? findSimilarFaqs(question, faqs, 3) : []),
    [question, faqs]
  );

  // A different set of suggestions needs a fresh confirmation.
  const similarKey = similar.map((f) => f.id).join(",");
  useEffect(() => setConfirmedNotListed(false), [similarKey]);

  if (!supabase) return null;

  const openForm = () => {
    setOpen(true);
    setJustSent(false);
    if (!question && prefill) setQuestion(prefill);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (similar.length > 0 && !confirmedNotListed) return;
    setSending(true);
    setError(null);
    const { data, error } = await supabase!.rpc("submit_question", {
      p_question: question,
      p_category: category || null,
    });
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (typeof data === "string") saveMyId(data);
    setJustSent(true);
    setOpen(false);
    setQuestion("");
    setCategory("");
    loadMine();
  };

  return (
    <div className="space-y-3">
      {justSent && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-emerald-900">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <strong>Thanks! Your question was sent for review.</strong> You can check its status below under
            &ldquo;My questions&rdquo; — this browser remembers it.
          </div>
        </div>
      )}

      {!open ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-slate-700">
            <strong className="text-slate-900">Can&apos;t find your question?</strong> Send it to the staff and
            they&apos;ll answer it.
          </div>
          <button
            onClick={openForm}
            className="inline-flex items-center justify-center gap-1.5 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition shrink-0"
          >
            <MessageCirclePlus className="w-4 h-4" />
            Ask a Question
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
          <div>
            <h2 className="font-semibold text-slate-900">Ask a question</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Staff review every question before it is published. English or Roman Urdu is fine. Please don&apos;t
              include personal details.
            </p>
          </div>
          <textarea
            required
            rows={3}
            minLength={10}
            maxLength={500}
            placeholder="Type your question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {similar.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
              <p className="text-sm font-semibold text-amber-950 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4" />
                Is your question already answered here?
              </p>
              <ul className="space-y-1.5">
                {similar.map((f) => (
                  <li key={f.id} className="bg-white border border-amber-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewId(previewId === f.id ? null : f.id)}
                      className="w-full text-left px-3 py-2 text-sm"
                    >
                      <span className="text-xs font-mono font-semibold text-slate-500 mr-1.5">{f.faq_code}</span>
                      <span className="text-slate-900">{f.question}</span>
                    </button>
                    {previewId === f.id && (
                      <div className="px-3 pb-2.5 text-sm text-slate-600 space-y-2">
                        <RichText value={f.answer} />
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false);
                            setQuestion("");
                            onOpenFaq(f.id);
                          }}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          ✓ Yes, this answers my question
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <label className="flex items-start gap-2 text-sm text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedNotListed}
                  onChange={(e) => setConfirmedNotListed(e.target.checked)}
                  className="mt-0.5"
                />
                None of these answer my question — send it to staff.
              </label>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 border border-slate-300 rounded-xl px-3.5 py-2 text-sm bg-white"
            >
              <option value="">Which office? (not sure)</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending || (similar.length > 0 && !confirmedNotListed)}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-sm bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                {sending ? "Sending..." : "Submit for Review"}
              </button>
            </div>
          </div>
          <div className="text-right text-xs text-slate-400 tabular-nums">{question.length}/500</div>
          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
        </form>
      )}

      {mine.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">My questions</h2>
            <button onClick={loadMine} className="text-xs text-slate-500 hover:text-slate-800">
              Refresh
            </button>
          </div>
          <ul className="divide-y divide-slate-100">
            {mine.map((s) => (
              <li key={s.id} className="px-5 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-slate-900">{s.question}</p>
                  <StatusBadge status={s.status} />
                </div>
                {(s.status === "approved" || s.status === "referred") && s.faq_answer && (
                  <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm space-y-1">
                    <p className="text-xs text-slate-500">
                      {s.status === "approved"
                        ? "Staff answered your question:"
                        : "Staff pointed you to this existing FAQ:"}
                    </p>
                    {s.status === "referred" && (
                      <p className="font-medium text-slate-900">
                        <span className="font-mono text-xs text-slate-500 mr-1.5">{s.faq_code}</span>
                        {s.faq_question}
                      </p>
                    )}
                    <RichText value={s.faq_answer} className="text-slate-700" />
                    {s.faq_id && (
                      <button
                        onClick={() => onOpenFaq(s.faq_id!)}
                        className="text-xs font-medium text-blue-700 hover:underline"
                      >
                        Show in the FAQ list
                      </button>
                    )}
                  </div>
                )}
                {s.status === "rejected" && (
                  <p className="text-xs text-slate-500">
                    Staff couldn&apos;t add this question. Please contact the relevant office directly.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MySubmission["status"] }) {
  const map = {
    pending: { label: "Waiting for review", cls: "bg-amber-50 text-amber-800 border-amber-200", Icon: Clock },
    approved: { label: "Answered", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    referred: { label: "Answered (existing FAQ)", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Link2 },
    rejected: { label: "Not accepted", cls: "bg-slate-100 text-slate-600 border-slate-200", Icon: XCircle },
  }[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium border px-2 py-0.5 rounded-full shrink-0 ${map.cls}`}
    >
      <map.Icon className="w-3.5 h-3.5" />
      {map.label}
    </span>
  );
}
