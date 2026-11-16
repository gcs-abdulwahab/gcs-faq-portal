import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type EditorRole = "editor" | "super_admin";

/** Which FAQs a staff member may edit or delete. */
export type FaqScope = "none" | "own" | "all";

export interface StaffAccess {
  role: EditorRole;
  canAdd: boolean;
  editScope: FaqScope;
  deleteScope: FaqScope;
  canViewDashboard: boolean;
}

function toScope(v: unknown): FaqScope {
  return v === "none" || v === "own" ? v : "all";
}

/** Role and permissions for a staff member, or null for visitors. Super admins always get everything. */
export async function getStaffAccess(email: string | undefined | null): Promise<StaffAccess | null> {
  if (!email || !supabase) return null;
  // Typed loosely: the permission columns may not exist yet, in which case we fall back to role only.
  let { data, error } = (await supabase
    .from("faq_editors")
    .select("role, can_add, edit_scope, delete_scope, can_view_dashboard")
    .eq("email", email)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: unknown };
  if (error) {
    ({ data, error } = await supabase.from("faq_editors").select("role").eq("email", email).maybeSingle());
  }
  if (!data) return null;
  const all = data.role === "super_admin";
  return {
    role: data.role as EditorRole,
    canAdd: all || data.can_add !== false,
    editScope: all ? "all" : toScope(data.edit_scope),
    deleteScope: all ? "all" : toScope(data.delete_scope),
    canViewDashboard: all || data.can_view_dashboard !== false,
  };
}

/** Whether a scope lets `email` change an FAQ created by `createdBy`. */
export function scopeAllows(scope: FaqScope | undefined, createdBy: string | null | undefined, email: string | null | undefined) {
  if (scope === "all") return true;
  if (scope === "own") return !!createdBy && !!email && createdBy.toLowerCase() === email.toLowerCase();
  return false;
}

export async function getEditorRole(email: string | undefined | null): Promise<EditorRole | null> {
  if (!email || !supabase) return null;
  const { data } = await supabase.from("faq_editors").select("role").eq("email", email).maybeSingle();
  return (data?.role as EditorRole) ?? null;
}

// Records a portal visit (no faqId) or an FAQ being opened, at most once per browser session.
export function recordView(faqId?: string) {
  if (!supabase) return;
  const key = `faq-viewed:${faqId ?? "page"}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Storage unavailable (private mode etc.): still record the view.
  }
  supabase.rpc("record_view", faqId ? { p_faq_id: faqId } : {}).then(() => {});
}
