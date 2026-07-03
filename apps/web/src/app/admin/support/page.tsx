import { requireAdmin } from "@/lib/admin-guard";
import { serviceClient } from "@/lib/supabase/service";
import type { SupportCategory, SupportStatus } from "@/lib/support";
import SupportInbox, { type InboxTicket } from "./support-inbox";

export const metadata = { title: "Admin · Support" };

// Founder-scale inbox: load the latest tickets and filter client-side,
// matching the artist-roster pattern (no server pagination exists in admin).
const INBOX_LIMIT = 300;

export default async function AdminSupportPage() {
  await requireAdmin();

  const { data: ticketData } = await serviceClient
    .from("support_tickets")
    .select(
      "id, reference, artist_id, subject, category, status, created_at, updated_at, last_artist_reply_at, last_admin_reply_at",
    )
    .order("updated_at", { ascending: false })
    .limit(INBOX_LIMIT);
  const tickets = (ticketData ?? []) as Array<{
    id: string;
    reference: string;
    artist_id: string;
    subject: string;
    category: SupportCategory;
    status: SupportStatus;
    created_at: string;
    updated_at: string;
    last_artist_reply_at: string | null;
    last_admin_reply_at: string | null;
  }>;

  // Resolve artist identity once per unique artist (name via profiles, email
  // via the auth admin API).
  const artistIds = [...new Set(tickets.map((t) => t.artist_id))];
  const { data: profileData } = artistIds.length
    ? await serviceClient
        .from("profiles")
        .select("id, display_name, slug")
        .in("id", artistIds)
    : { data: [] };
  const names = new Map(
    (profileData ?? []).map((p) => [
      p.id as string,
      ((p.display_name as string | null) || (p.slug as string | null)) ??
        "Unknown",
    ]),
  );
  const emails = new Map<string, string>(
    await Promise.all(
      artistIds.map(async (id): Promise<[string, string]> => {
        const res = await serviceClient.auth.admin
          .getUserById(id)
          .catch(() => null);
        return [id, res?.data?.user?.email ?? "unknown"];
      }),
    ),
  );

  const rows: InboxTicket[] = tickets.map((t) => ({
    id: t.id,
    reference: t.reference,
    subject: t.subject,
    category: t.category,
    status: t.status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    lastArtistReplyAt: t.last_artist_reply_at,
    lastAdminReplyAt: t.last_admin_reply_at,
    artistName: names.get(t.artist_id) ?? "Unknown",
    artistEmail: emails.get(t.artist_id) ?? "unknown",
  }));

  return <SupportInbox tickets={rows} limit={INBOX_LIMIT} />;
}
