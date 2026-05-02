import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined | null): boolean {
  return !!email && getAdminEmails().includes(email.trim().toLowerCase());
}

/** Server-side: redirects non-admins to /dashboard. Returns admin user id. */
export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  return user.id;
}

/** For use inside server actions: returns adminId or null if not authorized. */
export async function getAdminId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user.id;
}
