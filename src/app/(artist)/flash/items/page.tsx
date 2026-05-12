import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import FeatureIntroModal from "@/components/feature-intro-modal";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
} from "@/lib/flash";

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "bg-[color:var(--color-tint-green)] text-brand-charcoal",
    draft:
      "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]",
    archived:
      "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)] opacity-70",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[status] ?? "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]"}`}
    >
      {status}
    </span>
  );
}

function ModePill({ mode }: { mode: string }) {
  const styles: Record<string, string> = {
    unique: "bg-[color:var(--color-tint-mustard)] text-brand-charcoal",
    limited: "bg-[color:var(--color-tint-cobalt)] text-brand-charcoal",
    repeatable: "bg-[color:var(--color-tint-rosa)] text-brand-charcoal",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles[mode] ?? "bg-[color:var(--color-workspace-card-2)] text-[color:var(--color-workspace-fg-dim)]"}`}
    >
      {mode}
    </span>
  );
}

export default async function FlashItemsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: items } = await supabase
    .from("flash_items")
    .select("*")
    .eq("artist_id", user!.id)
    .order("created_at", { ascending: false });

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", user!.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";

  // Get confirmed + pending counts per flash item in two queries
  const flashIds = (items ?? []).map((i) => i.id);

  const confirmedMap = new Map<string, number>();
  const pendingMap = new Map<string, number>();

  if (flashIds.length > 0) {
    const [{ data: confirmed }, { data: pending }] = await Promise.all([
      supabase
        .from("booking_requests")
        .select("flash_item_id")
        .in("flash_item_id", flashIds)
        .eq("status", "approved"),
      supabase
        .from("booking_requests")
        .select("flash_item_id")
        .in("flash_item_id", flashIds)
        .eq("status", "pending"),
    ]);

    for (const b of confirmed ?? []) {
      if (b.flash_item_id)
        confirmedMap.set(
          b.flash_item_id,
          (confirmedMap.get(b.flash_item_id) ?? 0) + 1,
        );
    }
    for (const b of pending ?? []) {
      if (b.flash_item_id)
        pendingMap.set(
          b.flash_item_id,
          (pendingMap.get(b.flash_item_id) ?? 0) + 1,
        );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Flash Items
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bookable tattoo designs. Publish an item to make it available on
            your public flash page.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <FeatureIntroModal
            featureKey="flash-items"
            isEmpty={!items || items.length === 0}
          />
          <Link
            href="/flash/items/new"
            className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal"
          >
            New item
          </Link>
        </div>
      </div>

      {!items || items.length === 0 ? (
        <div className="rounded-[20px] border border-border px-6 py-12 text-center space-y-3">
          <p className="text-base text-muted-foreground">
            No flash items yet — create your first one to get started.
          </p>
          <Link
            href="/flash/items/new"
            className="inline-block rounded-md border border-border px-4 py-2 text-sm text-muted-foreground"
          >
            Create flash item
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[color:var(--color-workspace-hover)]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Item
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">
                  Mode
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                  Pending
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">
                  Confirmed
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Availability
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const confirmed = confirmedMap.get(item.id) ?? 0;
                const pending = pendingMap.get(item.id) ?? 0;
                const av = computeFlashAvailability(item, confirmed);
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-[color:var(--color-workspace-hover)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        <StatusPill status={item.status} />
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <div className="space-y-0.5">
                        <ModePill mode={item.booking_mode} />
                        {item.booking_mode === "limited" &&
                          item.max_bookings && (
                            <p className="text-xs text-muted-foreground">
                              max {item.max_bookings}
                            </p>
                          )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {pending}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {confirmed}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-sm font-medium ${av.bookable ? "text-brand-green" : "text-muted-foreground"}`}
                      >
                        {formatFlashAvailabilityLabel(av)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/flash/items/${item.id}`}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Edit
                        </Link>
                        {item.status === "published" && profile?.slug && (
                          <a
                            href={`${appUrl}/${profile.slug}/flash/${item.slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            View ↗
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
