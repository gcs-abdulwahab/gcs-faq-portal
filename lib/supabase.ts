import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type EditorRole = "editor" | "super_admin";

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
