import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { ClientDetailContent } from "@/components/clients/ClientDetailContent";
import { useLayoutClass } from "@/lib/layout";

// Thin route wrapper (ME-15): the profile CONTENT lives in
// ClientDetailContent so the Clients list can render it in a side pane at the
// expanded window class. Reconciliation Rule A with the same review
// hardening as app/bookings/[id].tsx: focus-gated (an unfocused buried route
// must not hijack the focused screen) and dismissTo-first (never stack a
// duplicate tabs navigator).
export default function ClientDetailScreen() {
  // Expo Router decodes the path segment, so `email` is the raw address; the
  // content component re-encodes it for the API path (the server decodes once).
  const { email: param } = useLocalSearchParams<{ email: string }>();
  const email = param ?? "";
  const router = useRouter();
  const focused = useIsFocused();
  const expanded = useLayoutClass() === "expanded";

  useEffect(() => {
    if (expanded && focused && email) {
      const target = {
        pathname: "/(tabs)/bookings/clients" as const,
        params: { selected: email },
      };
      if (router.canGoBack()) router.dismissTo(target);
      else router.replace(target);
    }
  }, [expanded, focused, email, router]);

  if (expanded) return null;

  return <ClientDetailContent email={email} />;
}
