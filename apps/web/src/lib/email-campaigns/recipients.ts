// Shared recipient resolution for the Email hub send paths. The campaign send
// (/api/internal/email-jobs) and the lifecycle engine (lib/email-campaigns/lifecycle/engine)
// both need the same three lookups for a resolved segment audience, so they live here exactly
// once:
//   profileMeta — display_name (for {{artist_name}}) + settings (for the opt-out check),
//                 fetched in 200-id chunks to avoid oversized .in() URLs
//   artistEmail — auth.admin.getUserById with BOUNDED CONCURRENCY (chunks of 10), not one
//                 sequential round-trip per artist (the sequential loop blew past Control
//                 Tower's dispatch fetch timeout even for the mandatory dry run)
//   suppressed  — the hard-bounce/complaint set from email_suppressions for those emails,
//                 chunked the same way; checked before every send, overrides opt-in
//
// Query errors THROW (into the caller's job/run failure handling) rather than being silently
// ignored: an incomplete suppression set must fail the send, never let it proceed and email a
// suppressed address. A failed getUserById lookup stays a null email (skipped as no_email).
import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import type { SegmentArtist } from "@/lib/email-campaigns/resolve-segment";

const PROFILE_CHUNK = 200; // avoid oversized .in() URLs
const EMAIL_CONCURRENCY = 10; // bounded parallelism for auth.admin.getUserById

export type RecipientMeta = {
  profileMeta: Map<
    string,
    { displayName: string; settings: Record<string, unknown> }
  >;
  artistEmail: Map<string, string | null>;
  suppressed: Set<string>;
};

/**
 * Resolve profile meta, email addresses, and the suppression set for a segment audience.
 * Artists are distinct (the resolver dedups), so no user is fetched twice.
 */
export async function resolveRecipientMeta(
  artists: SegmentArtist[],
): Promise<RecipientMeta> {
  // profile meta (display_name + settings) in chunks
  const profileMeta = new Map<
    string,
    { displayName: string; settings: Record<string, unknown> }
  >();
  for (let i = 0; i < artists.length; i += PROFILE_CHUNK) {
    const ids = artists.slice(i, i + PROFILE_CHUNK).map((a) => a.id);
    const { data, error } = await serviceClient
      .from("profiles")
      .select("id, display_name, settings")
      .in("id", ids);
    if (error) throw error;
    for (const p of (data ?? []) as {
      id: string;
      display_name: string | null;
      settings: unknown;
    }[]) {
      profileMeta.set(p.id, {
        displayName: p.display_name ?? "there",
        settings: (p.settings ?? {}) as Record<string, unknown>,
      });
    }
  }

  // emails via the admin API with bounded concurrency
  const artistEmail = new Map<string, string | null>();
  for (let i = 0; i < artists.length; i += EMAIL_CONCURRENCY) {
    const slice = artists.slice(i, i + EMAIL_CONCURRENCY);
    const resolved = await Promise.all(
      slice.map(async (a) => {
        const { data } = await serviceClient.auth.admin.getUserById(a.id);
        return [a.id, data.user?.email ?? null] as const;
      }),
    );
    for (const [id, email] of resolved) artistEmail.set(id, email);
  }

  // suppression set (hard bounces + complaints), chunked
  const emails = [
    ...new Set(
      [...artistEmail.values()].filter((e): e is string => Boolean(e)),
    ),
  ];
  const suppressed = new Set<string>();
  for (let i = 0; i < emails.length; i += PROFILE_CHUNK) {
    const chunk = emails.slice(i, i + PROFILE_CHUNK);
    const { data, error } = await serviceClient
      .from("email_suppressions")
      .select("recipient_email")
      .in("recipient_email", chunk);
    if (error) throw error;
    for (const s of (data ?? []) as { recipient_email: string }[]) {
      suppressed.add(s.recipient_email);
    }
  }

  return { profileMeta, artistEmail, suppressed };
}
