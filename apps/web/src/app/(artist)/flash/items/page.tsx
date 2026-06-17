import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import FeatureIntroModal from "@/components/feature-intro-modal";
import { isInstagramConfigured } from "@/lib/instagram";
import {
  computeFlashAvailability,
  formatFlashAvailabilityLabel,
  FLASH_ACTIVE_REQUEST_STATUSES,
} from "@/lib/flash";
import FlashTile from "./flash-tile";
import FlashFolderRail from "./flash-folder-rail";
import FlashNewItemButton from "./flash-new-item-button";
import FlashUploadManuallyLink from "./flash-upload-manually-link";
import { listFolders } from "@/lib/server/flash-folders";

type FlashItem = {
  id: string;
  title: string;
  status: string;
  preview_image_url: string | null;
  booking_mode: string;
  max_bookings: number | null;
  is_bookable: boolean;
  available_from: string | null;
  available_until: string | null;
  slug: string;
  folder_id: string | null;
};

export default async function FlashItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { folder: folderParam } = await searchParams;

  const [
    { data: items },
    { data: profile },
    { data: igAccount },
    { count: igPostCount },
    foldersResult,
  ] = await Promise.all([
    supabase
      .from("flash_items")
      .select(
        "id, title, status, preview_image_url, booking_mode, max_bookings, is_bookable, available_from, available_until, slug, folder_id",
      )
      .eq("artist_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("slug").eq("id", user!.id).single(),
    supabase
      .from("instagram_accounts")
      .select("username")
      .eq("artist_id", user!.id)
      .eq("connected", true)
      .maybeSingle(),
    supabase
      .from("instagram_posts")
      .select("*", { count: "exact", head: true })
      .eq("artist_id", user!.id),
    listFolders(supabase, user!.id),
  ]);

  const allItems = (items ?? []) as FlashItem[];
  const folders = "folders" in foldersResult ? foldersResult.folders : [];

  // Folder filter (?folder=all|unfiled|<id>). Counts are over the full set so
  // the rail shows totals regardless of the active filter.
  const active =
    folderParam === "unfiled"
      ? "unfiled"
      : folderParam && folders.some((f) => f.id === folderParam)
        ? folderParam
        : "all";
  const folderChips = folders.map((f) => ({
    id: f.id,
    name: f.name,
    count: allItems.filter((i) => i.folder_id === f.id).length,
  }));
  const unfiledCount = allItems.filter((i) => i.folder_id === null).length;

  const itemList =
    active === "all"
      ? allItems
      : active === "unfiled"
        ? allItems.filter((i) => i.folder_id === null)
        : allItems.filter((i) => i.folder_id === active);

  const hasItems = allItems.length > 0;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const flashPreviewUrl = profile?.slug
    ? `${appUrl}/${profile.slug}/flash`
    : null;
  const igConnected = !!igAccount;
  const igPosts = igPostCount ?? 0;

  // Only query active request counts when there are items to score.
  const activeRequestMap = new Map<string, number>();
  if (itemList.length > 0) {
    const itemIds = itemList.map((i) => i.id);
    const { data: activeRequests } = await supabase
      .from("booking_requests")
      .select("flash_item_id")
      .in("flash_item_id", itemIds)
      .in("status", [...FLASH_ACTIVE_REQUEST_STATUSES]);

    for (const b of activeRequests ?? []) {
      if (b.flash_item_id)
        activeRequestMap.set(
          b.flash_item_id,
          (activeRequestMap.get(b.flash_item_id) ?? 0) + 1,
        );
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Designs
          </h1>
          <p className="text-sm text-muted-foreground">
            Bookable tattoo designs. Published items appear on your public flash
            page.
          </p>
          {hasItems && flashPreviewUrl && (
            <a
              href={flashPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View flash page &rarr;
            </a>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <FeatureIntroModal featureKey="flash-items" isEmpty={!hasItems} />
          {hasItems && (
            <FlashNewItemButton
              igConnected={igConnected}
              igPostCount={igPosts}
            />
          )}
        </div>
      </div>

      {!hasItems ? (
        <FlashEmptyState
          igAccountUsername={igAccount?.username ?? null}
          igPostCount={igPosts}
        />
      ) : (
        <>
          <FlashFolderRail
            folders={folderChips}
            active={active}
            allCount={allItems.length}
            unfiledCount={unfiledCount}
          />
          {itemList.length === 0 ? (
            <p className="rounded-[20px] border border-border px-6 py-10 text-center text-sm text-muted-foreground">
              No designs in this folder yet.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {itemList.map((item) => {
                const av = computeFlashAvailability(
                  item,
                  activeRequestMap.get(item.id) ?? 0,
                );
                return (
                  <li key={item.id}>
                    <FlashTile
                      item={item}
                      folders={folders}
                      availabilityLabel={
                        // Show availability only when the item isn't the default
                        // happy path (published + bookable + unlimited).
                        av.bookable && av.remaining === undefined
                          ? null
                          : formatFlashAvailabilityLabel(av)
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FlashEmptyState({
  igAccountUsername,
  igPostCount,
}: {
  igAccountUsername: string | null;
  igPostCount: number;
}) {
  const configured = isInstagramConfigured();
  const hasPosts = igPostCount > 0;
  const igConnected = !!igAccountUsername;

  // Three empty-state variants, ordered by what the artist needs to do next.
  if (igConnected && hasPosts) {
    // IG connected + posts synced: nudge toward picking from existing posts.
    return (
      <div className="space-y-4 rounded-[20px] border border-border p-8">
        <div className="flex items-start gap-3">
          <Sparkles
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-mustard"
            strokeWidth={2}
          />
          <div className="space-y-1">
            <p className="text-base font-medium text-foreground">
              You have {igPostCount} synced Instagram post
              {igPostCount === 1 ? "" : "s"}
            </p>
            <p className="text-sm text-muted-foreground">
              Pick the ones you want to make bookable. They show up as flash
              designs on your public page.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/flash/instagram"
            className="inline-flex items-center gap-2 rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal"
          >
            Pick from Instagram
          </Link>
          <FlashUploadManuallyLink />
        </div>
      </div>
    );
  }

  if (igConnected && !hasPosts) {
    // IG connected but nothing synced yet (rare).
    return (
      <div className="space-y-4 rounded-[20px] border border-border p-8">
        <div className="flex items-start gap-3">
          <Sparkles
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-mustard"
            strokeWidth={2}
          />
          <div className="space-y-1">
            <p className="text-base font-medium text-foreground">
              Instagram connected as @{igAccountUsername}
            </p>
            <p className="text-sm text-muted-foreground">
              No posts synced yet — open Instagram settings to fetch your latest
              posts, then come back to pick which ones to make bookable.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/flash/instagram"
            className="inline-flex items-center gap-2 rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal"
          >
            Open Instagram settings
          </Link>
          <FlashUploadManuallyLink />
        </div>
      </div>
    );
  }

  // Default: no IG connected. Promote connect as primary path.
  return (
    <div className="space-y-4 rounded-[20px] border border-border p-8">
      <div className="flex items-start gap-3">
        <Sparkles
          className="mt-0.5 h-5 w-5 shrink-0 text-brand-mustard"
          strokeWidth={2}
        />
        <div className="space-y-1">
          <p className="text-base font-medium text-foreground">
            Start with Instagram
          </p>
          <p className="text-sm text-muted-foreground">
            Connect your account and your posts become bookable flash designs.
            Faster than uploading each one.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {configured ? (
          <Link
            href="/flash/instagram"
            className="inline-flex items-center gap-2 rounded-full bg-brand-mustard px-5 py-2.5 text-sm font-medium text-brand-charcoal"
          >
            Connect Instagram
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">
            Instagram integration isn&apos;t configured for this environment
            yet. You can still upload designs manually.
          </p>
        )}
        <Link
          href="/flash/items/new"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Or upload a design manually
        </Link>
      </div>
    </div>
  );
}
