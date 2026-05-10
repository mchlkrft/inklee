import { createClient } from "@/lib/supabase/server";
import { isInstagramConfigured } from "@/lib/instagram";
import PostsBrowser from "./posts-browser";
import AccountActions from "./account-actions";
import {
  connectInstagramAction,
  disconnectInstagramAction,
  syncInstagramAction,
} from "./actions";

// Resync downloads up to 50 thumbnails server-side; default 10s timeout would clip it.
export const maxDuration = 60;

export default async function FlashInstagramPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    synced?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const configured = isInstagramConfigured();
  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("username, last_sync_at")
    .eq("artist_id", user!.id)
    .eq("connected", true)
    .maybeSingle();

  const { data: rawPosts } = account
    ? await supabase
        .from("instagram_posts")
        .select("id, media_type, preview_image_path, permalink, caption")
        .eq("artist_id", user!.id)
        .order("posted_at", { ascending: false })
        .limit(100)
    : { data: [] };
  const posts = rawPosts ?? [];

  const linkedSet = new Set<string>();
  if (posts.length > 0) {
    const postIds = posts.map((post) => post.id);
    const { data: linked } = await supabase
      .from("flash_items")
      .select("instagram_post_id")
      .in("instagram_post_id", postIds)
      .eq("artist_id", user!.id)
      .not("instagram_post_id", "is", null);

    for (const row of linked ?? []) {
      if (row.instagram_post_id) linkedSet.add(row.instagram_post_id);
    }
  }

  const enrichedPosts = posts.map((post) => ({
    id: post.id,
    media_type: post.media_type,
    permalink: post.permalink,
    caption: post.caption,
    preview_url: post.preview_image_path
      ? supabase.storage.from("logos").getPublicUrl(post.preview_image_path)
          .data.publicUrl
      : null,
    already_linked: linkedSet.has(post.id),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Instagram</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Connect your Instagram account to import posts as flash items.
        </p>
      </div>

      {params.connected === "1" && (
        <div className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-500">
          Instagram connected. Your recent posts have been synced below.
        </div>
      )}
      {params.synced === "1" && (
        <div className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-500">
          Instagram posts synced successfully.
        </div>
      )}
      {params.error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {params.error === "denied"
            ? "Instagram connection was cancelled."
            : params.error === "not_connected"
              ? "Connect Instagram first before syncing posts."
              : params.error === "sync_failed"
                ? "Instagram sync failed - no new posts were imported."
                : "Instagram connection failed - please try again."}
        </div>
      )}

      <div className="rounded-md border border-border divide-y divide-border">
        <div className="px-5 py-3">
          <p className="text-sm font-medium text-foreground">
            Account connection
          </p>
        </div>

        {!configured ? (
          <div className="px-5 py-4 space-y-1">
            <p className="text-sm text-muted-foreground">
              Instagram integration is not configured for this environment yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Set <code className="font-mono">INSTAGRAM_APP_ID</code>,{" "}
              <code className="font-mono">INSTAGRAM_APP_SECRET</code>, and{" "}
              <code className="font-mono">INSTAGRAM_STATE_SECRET</code> to
              enable this feature.
            </p>
          </div>
        ) : account ? (
          <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                @{account.username}
              </p>
              {account.last_sync_at && (
                <p className="text-xs text-muted-foreground">
                  Last synced{" "}
                  {new Date(account.last_sync_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
            <AccountActions
              syncAction={syncInstagramAction}
              disconnectAction={disconnectInstagramAction}
            />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-2">
            <form action={connectInstagramAction}>
              <button
                type="submit"
                className="rounded-md bg-brand-mustard px-4 py-2.5 text-sm font-medium text-brand-charcoal"
              >
                Connect Instagram
              </button>
            </form>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be redirected to Instagram to authorize access to your
              posts.
            </p>
          </div>
        )}
      </div>

      {account && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-foreground">
              Synced posts
            </h2>
            <p className="text-sm text-muted-foreground">
              {enrichedPosts.length}{" "}
              {enrichedPosts.length === 1 ? "post" : "posts"}
            </p>
          </div>
          <PostsBrowser posts={enrichedPosts} />
        </div>
      )}
    </div>
  );
}
