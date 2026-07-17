import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ClientDetailContent } from "@/components/clients/ClientDetailContent";
import { useLayoutClass } from "@/lib/layout";

// Thin route wrapper (ME-15): the profile CONTENT lives in
// ClientDetailContent so the Clients list can render it in a side pane at the
// expanded window class. Reconciliation Rule A: at expanded this ROUTE always
// yields to the list-with-selection (covers deep links and rotation-grow
// while the route is on the stack).
export default function ClientDetailScreen() {
  // Expo Router decodes the path segment, so `email` is the raw address; the
  // content component re-encodes it for the API path (the server decodes once).
  const { email: param } = useLocalSearchParams<{ email: string }>();
  const email = param ?? "";
  const router = useRouter();
  const expanded = useLayoutClass() === "expanded";

  useEffect(() => {
    if (expanded && email) {
      router.replace({
        pathname: "/(tabs)/bookings/clients",
        params: { selected: email },
      });
    }
  }, [expanded, email, router]);

  if (expanded) return null;

  return <ClientDetailContent email={email} />;
}
