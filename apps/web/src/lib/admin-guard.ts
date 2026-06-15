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

/**
 * True when the session is only AAL1 but the user has a verified factor
 * enrolled, i.e. an MFA step-up is required before privileged access. Fails
 * CLOSED: if the assurance level can't be determined (transient Supabase error),
 * it returns true so a lookup failure can never grant un-stepped-up admin
 * access. The /admin surface is otherwise exempt from the proxy's AAL2 gate
 * (proxy.ts only covers ARTIST_PATHS), so this is the real enforcement point —
 * including for directly-invoked admin server actions, which never see the proxy.
 */
async function needsMfaStepUp(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  try {
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return true;
    // Fail closed if the levels are absent (only happens with no session) so the
    // helper is safe independent of caller ordering.
    if (!data.currentLevel || !data.nextLevel) return true;
    return data.nextLevel === "aal2" && data.currentLevel === "aal1";
  } catch {
    return true;
  }
}

/** Server-side: redirects non-admins to /dashboard, or an AAL1 admin who has a
 *  factor enrolled to the MFA challenge. Returns admin user id. */
export async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    redirect("/dashboard");
  }

  if (await needsMfaStepUp(supabase)) {
    redirect("/auth/mfa");
  }

  return user.id;
}

/** For use inside server actions: returns adminId, or null if the caller is not
 *  an admin OR is an admin whose session has not completed the MFA step-up. */
export async function getAdminId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return null;
  if (await needsMfaStepUp(supabase)) return null;
  return user.id;
}
