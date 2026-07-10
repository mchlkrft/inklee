// Public, no-auth email preference + unsubscribe page. Mirrors app/request/[token]/page.tsx:
// service-role server component, sha256 token lookup, inklee wordmark card, a PageState union.
// Possession of the durable per-artist token is the capability — there is no login. The
// visible email footer links and {{unsubscribe_link}} point here; the List-Unsubscribe header
// carries the sibling /api/unsubscribe/[token] route, which handles RFC 8058 one-click POSTs
// (a POST to this page would not flip anything) and redirects GET visitors back to this page.
import Link from "next/link";
import { serviceClient } from "@/lib/supabase/service";
import { lookupUnsubToken } from "@/lib/email-campaigns/unsubscribe-token";
import { readEmailPrefs } from "@/lib/email-campaigns/preferences";
import { UnsubscribeForm } from "./unsubscribe-form";

export const dynamic = "force-dynamic";

type PageState =
  | { type: "found"; marketing: boolean; lifecycle: boolean }
  | { type: "not-found" };

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const found = await lookupUnsubToken(token);
  let state: PageState;

  if (!found) {
    state = { type: "not-found" };
  } else {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("settings")
      .eq("id", found.artistId)
      .maybeSingle();
    const prefs = readEmailPrefs(profile?.settings);
    state = {
      type: "found",
      marketing: prefs.marketing,
      lifecycle: prefs.lifecycle,
    };
  }

  if (state.type === "not-found") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <Link
            href="/"
            className="mb-8 block text-xl font-semibold tracking-tight text-foreground"
          >
            inklee
          </Link>
          <h1 className="text-lg font-semibold text-foreground">
            Link not found
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            This unsubscribe link doesn&apos;t match an account. It may be
            invalid or mistyped. You can manage email preferences from your
            Inklee account settings instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        <Link
          href="/"
          className="block text-center text-xl font-semibold tracking-tight text-foreground"
        >
          inklee
        </Link>
        <div className="space-y-2 text-center">
          <h1 className="text-lg font-semibold text-foreground">
            Email preferences
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Choose which emails you&apos;d like to receive from Inklee.
          </p>
        </div>
        <UnsubscribeForm
          token={token}
          initialMarketing={state.marketing}
          initialLifecycle={state.lifecycle}
        />
      </div>
    </div>
  );
}
