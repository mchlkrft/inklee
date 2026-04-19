import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import crypto from "crypto";
import CustomerPortal from "./customer-portal";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isExpired(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() > 30 * 24 * 60 * 60 * 1000;
}

type PageState =
  | { type: "active"; booking: Parameters<typeof CustomerPortal>[0]["booking"] }
  | { type: "expired" }
  | { type: "used" }
  | { type: "not-found" }
  | { type: "cancelled" };

export default async function RequestPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenHash = hashToken(token);
  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("booking_requests")
    .select(
      `
      id, status, created_at,
      customer_handle, customer_email,
      preferred_date, form_data,
      profiles!artist_id(display_name)
    `,
    )
    .eq("customer_token_hash", tokenHash)
    .single();

  let state: PageState;

  if (!booking) {
    // Check if this token was rotated (single-use edit)
    const { data: auditEntry } = await supabase
      .from("audit_log")
      .select("id")
      .eq("action", "token_rotated")
      .filter("details->>old_hash", "eq", tokenHash)
      .limit(1)
      .single();

    state = auditEntry ? { type: "used" } : { type: "not-found" };
  } else if (booking.status === "cancelled") {
    state = { type: "cancelled" };
  } else {
    if (isExpired(booking.created_at)) {
      state = { type: "expired" };
    } else {
      const fd = booking.form_data as Record<string, string> | null;
      const profile = Array.isArray(booking.profiles)
        ? booking.profiles[0]
        : booking.profiles;

      state = {
        type: "active",
        booking: {
          id: booking.id,
          token,
          status: booking.status,
          handle: booking.customer_handle ?? "",
          email: booking.customer_email ?? "",
          placement: fd?.placement ?? "",
          size: fd?.size ?? "",
          description: fd?.description ?? "",
          referenceLink: fd?.reference_link ?? null,
          preferredDate: booking.preferred_date ?? "",
          artistName:
            (profile as { display_name: string } | null)?.display_name ??
            "the artist",
        },
      };
    }
  }

  if (state.type === "active") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="block text-center text-xl font-semibold tracking-tight text-foreground mb-10"
          >
            inklee
          </Link>
          <CustomerPortal booking={state.booking} />
        </div>
      </div>
    );
  }

  const messages: Record<
    Exclude<PageState["type"], "active">,
    { headline: string; body: string }
  > = {
    expired: {
      headline: "link expired",
      body: "this link was valid for 30 days. contact the artist directly if you need to make changes.",
    },
    used: {
      headline: "link already used",
      body: "this link was a one-time edit link. check your email for a new link that was sent after your last edit.",
    },
    cancelled: {
      headline: "request cancelled",
      body: "this booking request has been cancelled.",
    },
    "not-found": {
      headline: "link not found",
      body: "this link doesn't match any booking request. it may be invalid or mistyped.",
    },
  };

  const { headline, body } = messages[state.type];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <Link
          href="/"
          className="block text-xl font-semibold tracking-tight text-foreground mb-8"
        >
          inklee
        </Link>
        <h1 className="text-lg font-semibold text-foreground">{headline}</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
