import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Slice E1 — auth for the mobile JSON API (`/app/api/mobile/*`). The web app
// uses cookie sessions; the Expo app has no cookie jar, so it sends the Supabase
// access token as `Authorization: Bearer <token>`. We build a per-request
// Supabase client scoped to that token so Row Level Security applies as the
// signed-in artist — exactly like the cookie client, never the service-role key.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export type MobileAuth =
  | { ok: true; userId: string; supabase: SupabaseClient }
  | { ok: false; status: number; error: string };

/** Validate the Bearer token and return an RLS-scoped client for the artist. */
export async function requireMobileUser(req: Request): Promise<MobileAuth> {
  const header = req.headers.get("authorization") ?? "";
  const token = /^bearer\s+/i.test(header)
    ? header.replace(/^bearer\s+/i, "").trim()
    : null;
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, error: "Invalid or expired session." };
  }
  return { ok: true, userId: data.user.id, supabase };
}

/** Standard success envelope: `{ data }`. */
export function mobileOk(data: unknown): NextResponse {
  return NextResponse.json({ data });
}

/** Standard error envelope: `{ error: { code, message } }`. */
export function mobileError(
  status: number,
  message: string,
  code = "error",
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
