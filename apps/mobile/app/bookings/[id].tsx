import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { BookingDetailContent } from "@/components/booking/BookingDetailContent";
import { useLayoutClass } from "@/lib/layout";

// Thin route wrapper (ME-15): the detail CONTENT lives in
// BookingDetailContent so the Requests list can render it in a side pane at
// the expanded window class. Reconciliation Rule A: at expanded this ROUTE
// always yields to the list-with-selection — one rule covers cold-start deep
// links, push-notification taps, and a rotation/split-view grow while the
// route is on the stack.
//
// Review hardening: the redirect only fires while this route is FOCUSED
// (expo-router's imperative router acts on the focused route — an unfocused
// buried copy would hijack whatever screen is on top, e.g. an in-progress
// /bookings/new form). A buried detail route waits, rendering null, and
// redirects when it regains focus. dismissTo returns to the EXISTING tabs
// instance instead of stacking a duplicate navigator; the replace fallback
// covers cold starts where this route is the first and only screen.
export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const focused = useIsFocused();
  const expanded = useLayoutClass() === "expanded";

  useEffect(() => {
    if (expanded && focused && id) {
      const target = {
        pathname: "/(tabs)/bookings" as const,
        params: { selected: id },
      };
      if (router.canGoBack()) router.dismissTo(target);
      else router.replace(target);
    }
  }, [expanded, focused, id, router]);

  if (expanded) return null;

  return <BookingDetailContent id={id} />;
}
