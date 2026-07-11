import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { serviceClient } from "@/lib/supabase/service";
import { encryptToken } from "@/lib/gsc/crypto";
import { exchangeCode, listSites } from "@/lib/gsc/client";

export const runtime = "nodejs";

// GET /api/admin/gsc/callback — Google OAuth redirect target. Validates the
// CSRF state, exchanges the code server-side, stores the refresh token
// AES-256-GCM encrypted, snapshots the accessible properties, and returns to
// the cockpit. Tokens never reach the browser.
export async function GET(request: Request) {
  const adminId = await getAdminId();
  if (!adminId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const back = (query: string) =>
    NextResponse.redirect(
      new URL(`/admin/growth/search?gsc=${query}`, url.origin),
    );

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gsc_oauth_state")?.value;
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError)
    return back(`error-${encodeURIComponent(oauthError.slice(0, 50))}`);
  if (!code || !state || !expectedState || state !== expectedState) {
    return back("state-mismatch");
  }

  try {
    const tokens = await exchangeCode(code);

    // One active connection at a time: retire previous ones.
    await serviceClient
      .from("gsc_connections")
      .update({ disconnected_at: new Date().toISOString() })
      .is("disconnected_at", null);

    const { data: connection, error } = await serviceClient
      .from("gsc_connections")
      .insert({
        connected_by: adminId,
        encrypted_refresh_token: encryptToken(tokens.refreshToken),
        token_metadata: { scope: tokens.scope },
      })
      .select("id")
      .single();
    if (error || !connection)
      throw new Error(error?.message ?? "connection insert failed");

    const sites = await listSites(tokens.accessToken);
    if (sites.length > 0) {
      // Re-parent any previously active property by site_url so a reconnect
      // keeps its synced history (gsc_daily_* rows reference property_id).
      const { data: priorActive } = await serviceClient
        .from("gsc_properties")
        .select("site_url")
        .eq("is_active", true)
        .in(
          "site_url",
          sites.map((site) => site.siteUrl),
        );
      const priorActiveUrls = new Set(
        (priorActive ?? []).map((row) => row.site_url),
      );
      const singleAutoActivate = sites.length === 1;

      // Move existing rows for these site_urls onto the new connection (their
      // gsc_daily_* history travels with the property row's id).
      await serviceClient
        .from("gsc_properties")
        .update({
          connection_id: connection.id,
          updated_at: new Date().toISOString(),
        })
        .in(
          "site_url",
          sites.map((site) => site.siteUrl),
        );

      await serviceClient.from("gsc_properties").upsert(
        sites.map((site) => ({
          connection_id: connection.id,
          site_url: site.siteUrl,
          permission_level: site.permissionLevel,
          // Keep the prior active choice; auto-activate only a lone property.
          is_active: priorActiveUrls.has(site.siteUrl) || singleAutoActivate,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "connection_id,site_url" },
      );
    }

    void writeAudit({
      action: "admin_gsc_connected",
      actor: adminId,
      category: "admin",
    });

    const response = back(sites.length === 1 ? "connected" : "select-property");
    // Delete with the SAME path the connect route set it on, or the expiring
    // Set-Cookie does not match and the state cookie lingers.
    response.cookies.delete({
      name: "gsc_oauth_state",
      path: "/api/admin/gsc",
    });
    return response;
  } catch (err) {
    console.error("[gsc] callback failed", err);
    return back("exchange-failed");
  }
}
