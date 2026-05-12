import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/notification-types";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: notifications, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("artist_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (notifications ?? []) as Notification[];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.14em] text-muted-foreground">
          Tools
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-foreground">
          Notifications
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Recent booking activity, client updates, and system warnings.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Notifications could not be loaded.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">No notifications yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          {rows.map((notification) => (
            <div
              key={notification.id}
              className={`border-b border-border px-5 py-4 last:border-b-0 ${
                notification.is_read ? "" : "bg-brand-rosa/10"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">
                      {notification.title}
                    </p>
                    {!notification.is_read && (
                      <span className="rounded-full bg-brand-red px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-bone">
                        Unread
                      </span>
                    )}
                    {notification.priority === "critical" && (
                      <span className="rounded-full border border-destructive/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                        Critical
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {notification.message}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(notification.created_at)}
                  </p>
                </div>
                {notification.cta_href && notification.cta_label && (
                  <Link
                    href={notification.cta_href}
                    className="shrink-0 text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
                  >
                    {notification.cta_label}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
