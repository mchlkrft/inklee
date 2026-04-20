import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, relativeTime } from "@/lib/format";
import StatusActions from "./status-actions";
import ImageLightbox from "./image-lightbox";
import type { CustomAnswerSnapshot } from "@/lib/custom-fields";
import { formatCustomAnswer } from "@/lib/custom-fields";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: booking } = await supabase
    .from("booking_requests")
    .select("*, booking_images(storage_path)")
    .eq("id", id)
    .eq("artist_id", user!.id)
    .single();

  if (!booking) notFound();

  const fd = booking.form_data as Record<string, unknown> | null;
  const customAnswers =
    (fd?.custom_answers as CustomAnswerSnapshot[] | undefined) ?? [];

  // Generate signed URLs for images
  const signedUrls: string[] = [];
  for (const img of booking.booking_images ?? []) {
    const { data } = await supabase.storage
      .from("bookings")
      .createSignedUrl(img.storage_path, 3600);
    if (data?.signedUrl) signedUrls.push(data.signedUrl);
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/dashboard"
          className="hover:text-foreground transition-colors"
        >
          requests
        </Link>
        <span>/</span>
        <span className="text-foreground">@{booking.customer_handle}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fields */}
          <div className="rounded-md border border-border divide-y divide-border">
            <Row label="instagram" value={`@${booking.customer_handle}`} />
            <Row label="email" value={booking.customer_email ?? "—"} />
            <Row label="placement" value={(fd?.placement as string) ?? "—"} />
            <Row label="size" value={(fd?.size as string) ?? "—"} />
            <Row
              label="preferred date"
              value={
                booking.preferred_date
                  ? formatDate(booking.preferred_date)
                  : "—"
              }
            />
            {typeof fd?.reference_link === "string" && (
              <div className="flex px-4 py-3 gap-4">
                <span className="text-sm text-muted-foreground w-32 shrink-0">
                  reference
                </span>
                <a
                  href={fd.reference_link as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground underline underline-offset-4 break-all"
                >
                  {fd.reference_link as string}
                </a>
              </div>
            )}
            {customAnswers.map((ans) => (
              <Row
                key={ans.key}
                label={ans.label}
                value={formatCustomAnswer(ans)}
              />
            ))}
          </div>

          {/* Description */}
          {typeof fd?.description === "string" && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">description</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {fd.description as string}
              </p>
            </div>
          )}

          {/* Images */}
          {signedUrls.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                reference images ({signedUrls.length})
              </p>
              <ImageLightbox urls={signedUrls} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <StatusActions booking={{ id: booking.id, status: booking.status }} />

          <div className="rounded-md border border-border divide-y divide-border text-sm">
            <Row label="submitted" value={relativeTime(booking.created_at)} />
            {booking.decided_at && (
              <Row label="decided" value={relativeTime(booking.decided_at)} />
            )}
            <Row
              label="magic link"
              value={booking.customer_token_hash ? "active" : "none"}
            />
            <Row label="origin" value={booking.origin.replace("_", " ")} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex px-4 py-3 gap-4">
      <span className="text-sm text-muted-foreground w-32 shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
