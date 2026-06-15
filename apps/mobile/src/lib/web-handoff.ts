import * as WebBrowser from "expo-web-browser";
import { apiPost } from "./api";
import type { MobileConnectLink } from "@inklee/shared/mobile-api";

/**
 * Mint a one-time signed-in web link and open it in the in-app browser — the
 * handoff for flows the app deliberately leaves on the web (Stripe Connect
 * onboarding, booking-form editing, data export). Was hand-rolled identically
 * in three settings screens; callers keep their own pending/error state and
 * post-return invalidation.
 */
export async function openConnectHandoff(next: string): Promise<void> {
  const { url } = await apiPost<MobileConnectLink>("/settings/connect-link", {
    next,
  });
  await WebBrowser.openBrowserAsync(url);
}
