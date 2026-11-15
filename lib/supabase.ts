import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type EditorRole = "editor" | "super_admin";

export interface StaffAccess {
  role: EditorRole;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewDashboard: boolean;
}

/** Role and permissions for a staff member, or null for visitors. Super admins always get everything. */
export async function getStaffAccess(email: string | undefined | null): Promise<StaffAccess | null> {
  if (!email || !supabase) return null;
  let { data, error } = await supabase
    .from("faq_editors")
    .select("role, can_add, can_edit, can_delete, can_view_dashboard")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    // Permission columns not in the database yet: fall back to role only (full access for staff).
    ({ data, error } = await supabase.from("faq_editors").select("role").eq("email", email).maybeSingle());
  }
  if (!data) return null;
  const all = data.role === "super_admin";
  return {
    role: data.role as EditorRole,
    canAdd: all || data.can_add !== false,
    canEdit: all || data.can_edit !== false,
    canDelete: all || data.can_delete !== false,
    canViewDashboard: all || data.can_view_dashboard !== false,
  };
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
