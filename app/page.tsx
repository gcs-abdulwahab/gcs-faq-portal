"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  LogOut,
  LogIn,
  ChevronDown,
  ChevronUp,
  BookOpen,
  BarChart3,
  GripVertical,
  ArrowUpDown,
  Info,
} from "lucide-react";

interface FaqInfo {
  created_by: string | null;
  created_at: string | null;
  last_edited_by: string | null;
  last_edited_at: string | null;
  edit_count: number;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}
import { supabase, getEditorRole, recordView, type EditorRole } from "@/lib/supabase";
import { StarRating } from "@/components/StarRating";
import { AskQuestion } from "@/components/AskQuestion";
import { ReviewQueue } from "@/components/ReviewQueue";
import { RichText } from "@/components/RichText";
import { RichTextEditor } from "@/components/RichTextEditor";
import { isBlankRichText, toPlainText } from "@/lib/richText";

interface FAQ {
  id: string;
  faq_code: string;
  category: string;
  question: string;
  answer: string;
  updated_at?: string;
}

const FALLBACK_FAQS: FAQ[] = [
  { id: "1", faq_code: "REG-01", category: "Registrar Office", question: "How do I register for courses each semester, and what is the add/drop deadline?", answer: "Course registration is completed through the online Student Portal (CMS) during the announced enrollment window prior to the start of classes. Students may add or drop courses without academic penalty within the first two weeks of the semester." },
  { id: "2", faq_code: "REG-02", category: "Registrar Office", question: "How can I withdraw from a course after the add/drop period?", answer: "Students may apply to withdraw from a course up to the end of the designated withdrawal window (typically weeks 4–6 of the semester) through their academic advisor and department chairperson. A 'W' grade will appear on the transcript, which does not affect CGPA calculation." },
  { id: "3", faq_code: "REG-03", category: "Registrar Office", question: "What is the procedure for freezing a semester?", answer: "Submit a formal Semester Freeze Application to the Registrar’s Office before midterm examinations begin, citing valid medical or personal grounds. During a frozen semester, active student/bonafide status is temporarily suspended." },
  { id: "4", faq_code: "REG-04", category: "Registrar Office", question: "How do I request a Migration Certificate or No Objection Certificate (NOC)?", answer: "Submit the prescribed application form along with a clearance slip (from the library, accounts, and department) and the requisite fee challan to the Registrar’s Office. Processing typically takes 5–7 working days." },
  { id: "5", faq_code: "REG-05", category: "Registrar Office", question: "How do I correct my name, father’s name, or date of birth on university records?", answer: "Submit an application to the Registration Branch accompanied by attested copies of your Matriculation/O-Level certificate and CNIC/B-Form, along with the record correction fee." },
  { id: "6", faq_code: "REG-06", category: "Registrar Office", question: "How do I obtain a Bonafide Student Certificate or Enrollment Verification?", answer: "Apply online via the student portal or submit a written request with a copy of your valid university ID card to the Registrar’s Office." },
  { id: "7", faq_code: "COE-01", category: "Controller of Examinations", question: "When are examination date sheets issued, and how do I download my Roll Number Slip?", answer: "Date sheets are published on the university website and notice boards at least 2–3 weeks before exams. Roll Number Slips (Admit Cards) can be downloaded from the student portal once fee clearance and minimum attendance requirements (typically 75%) are verified." },
  { id: "8", faq_code: "COE-02", category: "Controller of Examinations", question: "What should I do if I miss a midterm or final exam due to a medical emergency?", answer: "Immediately submit a written application to your Head of Department and the Controller of Examinations within 48 hours of the missed exam, attaching medical documentation from an authorized hospital. Approval for a makeup exam is subject to university rules." },
  { id: "9", faq_code: "COE-03", category: "Controller of Examinations", question: "How can I apply for paper re-checking or re-totaling after results are declared?", answer: "Submit the Examination Grievance / Re-checking Form within 15 days of result declaration along with the prescribed per-course fee. Note that re-checking covers re-totaling of marks and ensuring no answer was left unmarked, rather than full re-evaluation." },
  { id: "10", faq_code: "COE-04", category: "Controller of Examinations", question: "What is the process for repeating a failed course or improving a low grade?", answer: "Students may re-register for failed courses or apply for grade improvement during regular or summer semesters within the maximum degree duration. The better grade is reflected on the final transcript, though improved courses may be marked with an asterisk and excluded from merit positions." },
  { id: "11", faq_code: "COE-05", category: "Controller of Examinations", question: "How do I apply for an Official Transcript or Provisional Certificate?", answer: "Once final semester results are notified, submit the Transcript/Provisional Certificate Application Form, final clearance certificate, and fee receipt to the Examination Branch." },
  { id: "12", faq_code: "COE-06", category: "Controller of Examinations", question: "What is required for Degree Issuance and Verification?", answer: "Degrees are issued at the annual Convocation or upon urgent application thereafter. For degree verification (for HEC attestation or employers), submit copies of your final transcript, degree, CNIC, and the verification fee receipt to the Controller’s Office." },
  { id: "13", faq_code: "SCH-01", category: "Scholarships & Financial Aid", question: "What types of scholarships are available to students?", answer: "Students can apply for Merit-Based Scholarships (based on admission test/semester GPA), Need-Based Financial Aid (such as HEC Need-Based Scholarships and university hardship funds), and External/Government Schemes (e.g., PEEF, Bait-ul-Mal, and corporate endowments)." },
  { id: "14", faq_code: "SCH-02", category: "Scholarships & Financial Aid", question: "Am I eligible to apply for Need-Based Financial Aid if I am enrolled on a self-finance seat?", answer: "Generally, no. Most government and institutional need-based programs (including HEC Need-Based Scholarships) require admission on regular merit and exclude self-finance seats." },
  { id: "15", faq_code: "SCH-03", category: "Scholarships & Financial Aid", question: "What documents are required to apply for a Need-Based Scholarship?", answer: "Applicants must submit copies of student and parent/guardian CNICs, salary slips/income certificates (or business bank statements), last 6 months' utility bills, rent agreement (if applicable), and fee receipts of siblings." },
  { id: "16", faq_code: "SCH-04", category: "Scholarships & Financial Aid", question: "Can I hold two scholarships or financial aid awards at the same time?", answer: "No. Students are not permitted to avail dual financial assistance simultaneously. If selected for a second scholarship, you must notify the Financial Aid Office and choose one." },
  { id: "17", faq_code: "SCH-05", category: "Scholarships & Financial Aid", question: "What GPA or attendance is required to maintain my scholarship in subsequent semesters?", answer: "Continuing recipients must maintain the minimum required CGPA (typically 2.50 for need-based and 3.50+ for merit scholarships), meet the 75% attendance threshold, and remain free of any disciplinary penalties." },
  { id: "18", faq_code: "SCH-06", category: "Scholarships & Financial Aid", question: "How and when are scholarship stipends or tuition waivers disbursed?", answer: "Tuition waivers are adjusted directly against your semester fee challan before the due date. Monthly stipends (where applicable) are disbursed via bank transfer/crossed cheque after semester enrollment verification." }
];

export default function FAQPortal() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<EditorRole | null>(null);
  const isEditor = role !== null;
  const [authChecked, setAuthChecked] = useState(false); // avoids flashing viewer-only UI to editors
  const isSuperAdmin = role === "super_admin";
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [editingFaq, setEditingFaq] = useState<Partial<FAQ> | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [saving, setSaving] = useState(false);

  // Super admin drag-and-drop ordering
  const [reorderList, setReorderList] = useState<FAQ[] | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const moveItem = (from: number, to: number) => {
    setReorderList((list) => {
      if (!list || to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const saveOrder = async () => {
    if (!supabase || !reorderList) return;
    setSavingOrder(true);
    const { error } = await supabase.rpc("reorder_faqs", { p_ids: reorderList.map((f) => f.id) });
    setSavingOrder(false);
    if (error) {
      alert("Error saving order: " + error.message);
      return;
    }
    setReorderList(null);
    fetchFaqs();
  };

  const fetchFaqs = async () => {
    setLoading(true);
    if (!supabase) {
      setFaqs(FALLBACK_FAQS);
      setLoading(false);
      return;
    }
    const [{ data, error }, ratingsRes] = await Promise.all([
      supabase
        .from("faqs")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("faq_code", { ascending: true }),
      supabase.rpc("faq_star_ratings"),
    ]);
    if (ratingsRes.data) {
      setStars(
        Object.fromEntries((ratingsRes.data as { faq_id: string; stars: number }[]).map((r) => [r.faq_id, r.stars]))
      );
    }
    if (!error && data && data.length > 0) {
      setFaqs(data);
    } else {
      setFaqs(FALLBACK_FAQS);
    }
    setLoading(false);
  };

  const checkEditorRole = async (email: string | undefined) => {
    if (!email || !supabase) {
      setUserEmail(null);
      setRole(null);
      setAuthChecked(true);
      return;
    }
    setUserEmail(email);
    setRole(await getEditorRole(email));
    setAuthChecked(true);
  };

  // Super admin: who added / last edited an FAQ
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [infoData, setInfoData] = useState<FaqInfo | null>(null);

  const toggleInfo = async (id: string) => {
    if (infoFor === id) {
      setInfoFor(null);
      return;
    }
    setInfoFor(id);
    setInfoData(null);
    if (!supabase) return;
    const { data, error } = await supabase.rpc("admin_faq_info", { p_faq_id: id });
    if (error) {
      setInfoFor(null);
      alert("Could not load history: " + error.message);
      return;
    }
    setInfoData(((data as FaqInfo[]) ?? [])[0] ?? null);
  };

  // Jump to an FAQ in the list (used by "Ask a question" suggestions and answers).
  const openFaq = (id: string) => {
    setSearchQuery("");
    setSelectedCategory("All");
    setExpandedId(id);
    recordView(id);
    setTimeout(() => document.getElementById(`faq-${id}`)?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const toggleFaq = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      recordView(id);
    }
  };

  useEffect(() => {
    fetchFaqs();
    recordView();
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkEditorRole(session?.user?.email);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      checkEditorRole(session?.user?.email);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(faqs.map((f) => f.category)));
    return ["All", ...unique];
  }, [faqs]);

  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const matchesCat = selectedCategory === "All" || faq.category === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        faq.question.toLowerCase().includes(q) ||
        toPlainText(faq.answer).toLowerCase().includes(q) ||
        faq.faq_code.toLowerCase().includes(q) ||
        faq.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [faqs, selectedCategory, searchQuery]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setAuthMessage("Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable staff login.");
      return;
    }
    setLoggingIn(true);
    setAuthMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });
    setLoggingIn(false);
    if (error) {
      setAuthMessage(error.message);
    } else {
      setLoginEmail("");
      setLoginPassword("");
      setShowLogin(false);
    }
  };

  const handleSaveFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaq || !supabase) return;
    const finalCategory =
      editingFaq.category === "__NEW__" ? customCategory.trim() : editingFaq.category;

    if (!finalCategory || !editingFaq.faq_code || !editingFaq.question || isBlankRichText(editingFaq.answer)) {
      alert("Please fill in all fields.");
      return;
    }

    setSaving(true);
    const payload = {
      faq_code: editingFaq.faq_code.trim().toUpperCase(),
      category: finalCategory,
      question: editingFaq.question.trim(),
      answer: (editingFaq.answer ?? "").trim(),
      updated_at: new Date().toISOString(),
    };

    const { error } = editingFaq.id
      ? await supabase.from("faqs").update(payload).eq("id", editingFaq.id)
      : await supabase.from("faqs").insert([payload]);

    setSaving(false);
    if (error) {
      alert("Error saving FAQ: " + error.message);
      return;
    }

    setEditingFaq(null);
    setCustomCategory("");
    fetchFaqs();
  };

  const handleDeleteFaq = async (id: string) => {
    if (!supabase || !confirm("Are you sure you want to delete this FAQ?")) return;
    const { error } = await supabase.from("faqs").delete().eq("id", id);
    if (error) alert("Error deleting FAQ: " + error.message);
    else fetchFaqs();
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="bg-slate-900 text-white">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="bg-blue-600 p-2.5 rounded-xl mt-0.5">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">GCS Student FAQs Portal</h1>
              <p className="text-slate-300 text-sm mt-1">
                Registrar Office, Controller of Examinations, Scholarships & Student Services
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {userEmail ? (
              <div className="flex items-center gap-3 bg-slate-800 px-3.5 py-2 rounded-xl border border-slate-700">
                <div className="text-xs">
                  <div className="font-medium text-slate-200">{userEmail}</div>
                  <div className={isEditor ? "text-emerald-400 font-semibold" : "text-slate-400"}>
                    {isSuperAdmin ? "Super Admin" : isEditor ? "Authorized Editor" : "View-Only Access"}
                  </div>
                </div>
                {isSuperAdmin && (
                  <Link
                    href="/admin"
                    className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition"
                    title="Admin Dashboard"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </Link>
                )}
                <button
                  onClick={() => supabase?.auth.signOut()}
                  className="text-slate-300 hover:text-white p-1.5 rounded-lg hover:bg-slate-700 transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowLogin(!showLogin);
                  setAuthMessage(null);
                }}
                className="inline-flex items-center gap-2 text-sm bg-white text-slate-900 font-medium px-4 py-2 rounded-xl hover:bg-slate-100 transition shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Staff Login
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {!supabase && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs">
            <strong>Preview Mode:</strong> Displaying pre-loaded FAQs. Connect your Supabase URL and Anon Key in <code>.env.local</code> or Vercel Environment Variables to enable live database syncing and staff editing.
          </div>
        )}

        {showLogin && !userEmail && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Authorized Staff Editor Login</h2>
              <button onClick={() => setShowLogin(false)} className="text-xs text-slate-400 hover:text-slate-600">
                Close
              </button>
            </div>
            <form onSubmit={handlePasswordLogin} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                required
                autoComplete="username"
                placeholder="Staff email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="flex-1 border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="flex-1 border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={loggingIn}
                className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition disabled:opacity-60"
              >
                {loggingIn ? "Signing in..." : "Sign In"}
              </button>
            </form>
            {authMessage && <p className="text-xs text-red-600 font-medium">{authMessage}</p>}
          </div>
        )}

        {isEditor && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-blue-950">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <span>
                <strong>Editor Access Active:</strong> You can add new departments/categories, publish FAQs, or update existing answers.
              </span>
            </div>
            <div className="flex gap-2 shrink-0">
              {isSuperAdmin && !reorderList && (
                <button
                  onClick={() => {
                    setEditingFaq(null);
                    setReorderList([...faqs]);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 bg-white border border-blue-300 text-blue-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-100 transition"
                >
                  <ArrowUpDown className="w-4 h-4" />
                  Reorder FAQs
                </button>
              )}
              <button
                onClick={() =>
                  setEditingFaq({
                    faq_code: "",
                    category: categories[1] || "Registrar Office",
                    question: "",
                    answer: "",
                  })
                }
                className="inline-flex items-center justify-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
              >
                <Plus className="w-4 h-4" />
                Add New FAQ
              </button>
            </div>
          </div>
        )}

        {isEditor && !reorderList && (
          <ReviewQueue
            categories={categories.filter((c) => c !== "All")}
            existingCodes={faqs}
            onPublished={fetchFaqs}
          />
        )}

        {isSuperAdmin && reorderList && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-lg text-slate-900">Reorder FAQs</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Drag by the handle, or use the arrows. Students see FAQs in this order (also within each category).
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => setReorderList(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={saveOrder}
                  disabled={savingOrder}
                  className="px-5 py-2 text-sm bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingOrder ? "Saving..." : "Save Order"}
                </button>
              </div>
            </div>

            <ol className="space-y-1.5">
              {reorderList.map((faq, index) => (
                <li
                  key={faq.id}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== index) {
                      moveItem(dragIndex, index);
                      setDragIndex(index);
                    }
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  onDrop={(e) => e.preventDefault()}
                  className={`flex items-center gap-2 bg-slate-50 border rounded-xl px-2.5 py-2 transition ${
                    dragIndex === index ? "border-blue-400 bg-blue-50 opacity-70" : "border-slate-200"
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-slate-400 cursor-grab active:cursor-grabbing shrink-0" />
                  <span className="text-xs text-slate-400 tabular-nums w-5 text-right shrink-0">{index + 1}</span>
                  <span className="text-xs font-mono font-semibold bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md shrink-0">
                    {faq.faq_code}
                  </span>
                  <span className="text-sm text-slate-800 truncate flex-1 min-w-0">{faq.question}</span>
                  <div className="flex shrink-0">
                    <button
                      onClick={() => moveItem(index, index - 1)}
                      disabled={index === 0}
                      className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded disabled:opacity-30"
                      title="Move up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveItem(index, index + 1)}
                      disabled={index === reorderList.length - 1}
                      className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded disabled:opacity-30"
                      title="Move down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {editingFaq && isEditor && (
          <form onSubmit={handleSaveFaq} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg space-y-4">
            <h2 className="font-bold text-lg text-slate-900">
              {editingFaq.id ? `Edit FAQ (${editingFaq.faq_code})` : "Create New FAQ Entry"}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  FAQ Code (e.g., REG-07, SCH-07, LIB-01)
                </label>
                <input
                  type="text"
                  required
                  placeholder="REG-07"
                  value={editingFaq.faq_code || ""}
                  onChange={(e) => setEditingFaq({ ...editingFaq, faq_code: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Department / Category</label>
                <select
                  value={editingFaq.category || ""}
                  onChange={(e) => setEditingFaq({ ...editingFaq, category: e.target.value })}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm bg-white"
                >
                  {categories
                    .filter((c) => c !== "All")
                    .map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  <option value="__NEW__">+ Create New Category...</option>
                </select>
              </div>
            </div>

            {editingFaq.category === "__NEW__" && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Category / Office Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Accounts & Fee Office, Hostel Administration, Library"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Question</label>
              <input
                type="text"
                required
                placeholder="Enter the student question..."
                value={editingFaq.question || ""}
                onChange={(e) => setEditingFaq({ ...editingFaq, question: e.target.value })}
                className="w-full border border-slate-300 rounded-xl px-3.5 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Official Answer</label>
              <RichTextEditor
                placeholder="Provide clear, accurate instructions..."
                value={editingFaq.answer || ""}
                onChange={(html) => setEditingFaq({ ...editingFaq, answer: html })}
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingFaq(null);
                  setCustomCategory("");
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-sm bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save FAQ"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by keyword, office, or code (e.g., transcript, freeze, scholarship, HEC)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-2xl pl-11 pr-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  selectedCategory === cat
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm">Loading FAQs...</div>
        ) : filteredFaqs.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
            No FAQs matched your search or selected category.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFaqs.map((faq) => {
              const isOpen = expandedId === faq.id || searchQuery.length > 0;
              return (
                <div
                  key={faq.id}
                  id={`faq-${faq.id}`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition hover:border-slate-300 scroll-mt-4"
                >
                  <div
                    onClick={() => toggleFaq(faq.id)}
                    className="p-5 cursor-pointer flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md">
                          {faq.faq_code}
                        </span>
                        <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
                          {faq.category}
                        </span>
                        <StarRating stars={stars[faq.id] ?? 0} />
                      </div>
                      <h3 className="font-semibold text-slate-900 text-base">{faq.question}</h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditor && (
                        <div className="flex items-center gap-1.5 mr-2" onClick={(e) => e.stopPropagation()}>
                          {isSuperAdmin && (
                            <button
                              onClick={() => toggleInfo(faq.id)}
                              className={`p-1.5 rounded-lg transition ${
                                infoFor === faq.id
                                  ? "text-violet-700 bg-violet-50"
                                  : "text-slate-600 hover:text-violet-700 hover:bg-violet-50"
                              }`}
                              title="Who added / edited this FAQ"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditingFaq(faq)}
                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            title="Edit FAQ"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteFaq(faq.id)}
                            className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Delete FAQ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      <ChevronDown
                        className={`w-5 h-5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </div>
                  </div>

                  {isSuperAdmin && infoFor === faq.id && (
                    <div className="mx-5 mb-4 bg-violet-50 border border-violet-200 rounded-xl p-3.5 text-xs text-violet-950">
                      {!infoData ? (
                        <span className="text-violet-700">Loading history…</span>
                      ) : (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                          <dt className="font-semibold">Added by</dt>
                          <dd>
                            {infoData.created_by ? (
                              <>
                                {infoData.created_by} · {formatDateTime(infoData.created_at)}
                              </>
                            ) : (
                              <span className="text-violet-700">Original FAQ (imported at setup)</span>
                            )}
                          </dd>
                          <dt className="font-semibold">Last edited by</dt>
                          <dd>
                            {infoData.last_edited_by ? (
                              <>
                                {infoData.last_edited_by} · {formatDateTime(infoData.last_edited_at)}
                                {Number(infoData.edit_count) > 1 && (
                                  <span className="text-violet-700"> ({infoData.edit_count} edits in total)</span>
                                )}
                              </>
                            ) : (
                              <span className="text-violet-700">Never edited</span>
                            )}
                          </dd>
                        </dl>
                      )}
                    </div>
                  )}

                  {isOpen && (
                    <div className="px-5 pb-5 pt-0 border-t border-slate-100">
                      <RichText value={faq.answer} className="text-slate-600 text-sm leading-relaxed pt-3" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Asking questions is for viewers; editors answer them in the review queue instead. */}
        {!loading && (authChecked || !supabase) && !isEditor && (
          <AskQuestion
            categories={categories.filter((c) => c !== "All")}
            faqs={faqs}
            prefill={searchQuery}
            onOpenFaq={openFaq}
          />
        )}
      </div>
    </main>
  );
}
