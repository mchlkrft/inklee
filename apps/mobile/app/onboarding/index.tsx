import { useState } from "react";
import { Redirect, useRouter } from "expo-router";
import type { MobileMe } from "@inklee/shared/mobile-api";
import { useApiQuery } from "@/lib/api";
import { OnboardingIntro } from "@/components/onboarding/OnboardingIntro";

// Wizard entry, resume-aware off /me. The root navigator warms the /me cache and
// its gate guarantees the row belongs to the current signed-in user before this
// stack mounts, so reading me.data here (without re-checking userId) is safe.
//
// The resume decision is FROZEN at first mount: a cold launch with a slug already
// claimed jumps straight to the you're-live finish; a brand-new artist sees the
// intro. Freezing matters because the claim step adds a slug to /me — without it,
// navigating BACK to this screen mid-wizard would wrongly bounce the artist
// forward to done. Within the live wizard, back always returns to the intro.
export default function OnboardingIndex() {
  const router = useRouter();
  const me = useApiQuery<MobileMe>("/me");
  const [resume] = useState(() => Boolean(me.data?.slug));

  if (resume) return <Redirect href="/onboarding/done" />;

  return <OnboardingIntro onDone={() => router.push("/onboarding/claim")} />;
}
