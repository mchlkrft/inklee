import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import { checkMfaRecoverRateLimit } from "@/lib/ratelimit";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  // Throttle brute-force of the 8-char recovery code. Keyed by the session
  // user so an attacker can't rotate IPs to widen the search; bounds attempts
  // before a code could be guessed and the TOTP factor unenrolled.
  const { allowed } = await checkMfaRecoverRateLimit(user.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  let body: { code?: string };
  try {
    body = (await request.json()) as { code?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid recovery code" },
      { status: 400 },
    );
  }
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code || code.length !== 8) {
    return NextResponse.json(
      { error: "Invalid recovery code" },
      { status: 400 },
    );
  }

  // Load stored hashes
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("settings")
    .eq("id", user.id)
    .single();

  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  const storedHashes =
    (settings.mfa_recovery_codes as string[] | undefined) ?? [];

  if (storedHashes.length === 0) {
    return NextResponse.json(
      { error: "No recovery codes on file" },
      { status: 400 },
    );
  }

  const hash = await sha256(code);
  const idx = storedHashes.indexOf(hash);
  if (idx === -1) {
    return NextResponse.json(
      { error: "Invalid recovery code" },
      { status: 400 },
    );
  }

  // Remove used code
  const remaining = storedHashes.filter((_, i) => i !== idx);

  // Unenroll the TOTP factor (so user regains access at AAL1)
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (totp) {
    await supabase.auth.mfa.unenroll({ factorId: totp.id });
  }

  // Persist remaining codes (now factor is gone, codes are vestigial but clear anyway)
  await serviceClient
    .from("profiles")
    .update({ settings: { ...settings, mfa_recovery_codes: remaining } })
    .eq("id", user.id);

  void writeAudit({
    action: "2fa_recovery_code_used",
    actor: user.id,
    category: "auth",
    details: { codes_remaining: remaining.length },
  });

  return NextResponse.json({ ok: true });
}
