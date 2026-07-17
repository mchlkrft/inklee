import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BookingDetailContent } from "@/components/booking/BookingDetailContent";
import { useLayoutClass } from "@/lib/layout";

// Thin route wrapper (ME-15): the detail CONTENT lives in
// BookingDetailContent so the Requests list can render it in a side pane at
// the expanded window class. Reconciliation Rule A: at expanded this ROUTE
// always yields to the list-with-selection — one rule covers cold-start deep
// links, push-notification taps, and a rotation/split-view grow while the
// route is on the stack. router.replace keeps the back stack clean (the
// detail route is not left poppable underneath).
export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const layoutClass = useLayoutClass();
  const expanded = layoutClass === "expanded";

  useEffect(() => {
    if (expanded && id) {
      router.replace({
        pathname: "/(tabs)/bookings",
        params: { selected: id },
      });
    }
  }, [expanded, id, router]);

  // One frame while the replace lands; the stack contentStyle keeps the
  // background themed, so there is no flash.
  if (expanded) return null;

  return <BookingDetailContent id={id} />;
}
