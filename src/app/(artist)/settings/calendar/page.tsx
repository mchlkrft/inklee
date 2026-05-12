import { createClient } from "@/lib/supabase/server";
import { generateIcalToken, revokeIcalToken } from "./actions";

export default async function CalendarExportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", user!.id)
    .single();

  const settings = profile?.settings as Record<string, string> | null;
  const token = settings?.ical_token ?? null;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inklee.app";
  const feedUrl = token ? `${appUrl}/api/ical/${token}` : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Calendar export
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Subscribe to your approved bookings in any calendar app.
        </p>
      </div>

      {feedUrl ? (
        <div className="space-y-4">
          <div className="rounded-[20px] border border-border p-5 space-y-2">
            <p className="text-xs text-muted-foreground">Your iCal feed URL</p>
            <p className="text-sm text-foreground font-mono break-all">
              {feedUrl}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Paste this URL into Google Calendar, Apple Calendar, or any app that
            supports iCal subscriptions. The feed updates automatically.
          </p>
          <form action={revokeIcalToken}>
            <button
              type="submit"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-destructive transition-colors"
            >
              Revoke and generate new link
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No feed generated yet. Generate a private link to subscribe to your
            bookings.
          </p>
          <form action={generateIcalToken}>
            <button
              type="submit"
              className="rounded-md bg-brand-mustard px-4 py-2 text-sm font-medium text-brand-charcoal"
            >
              Generate feed link
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
