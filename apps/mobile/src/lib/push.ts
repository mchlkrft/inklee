import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { apiDelete, apiPost } from "./api";
import { captureError } from "./telemetry";

// Slice 3 — push notification token lifecycle + tap-to-route. The *delivery*
// half (the server pushing to Expo's service via APNs/FCM) needs EAS push
// credentials, which require the Apple/Google store accounts; this is the
// device-side code that registers the token and routes a tapped notification.

// Foreground presentation: show the banner + add to the tray + sound + badge
// even while the app is open. Configured once when this module loads.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// The push `data` payload the server attaches to a notification. Kept aligned
// with the in-app feed, which routes off `metadata.booking_id` (see
// app/notifications.tsx) — so a "new request" push deep-links to the same place
// a tap on the in-app row does. `path` is an escape hatch for any other in-app
// route the server may target later, without a client change.
type PushData = { booking_id?: unknown; path?: unknown };

// In-app routes the `path` escape hatch may target. Deliberately excludes
// sensitive/destructive screens (/account, /settings) so a crafted or spoofed
// push payload can't deep-link a signed-in artist onto e.g. "Delete account".
const PUSH_ROUTABLE_PREFIXES = [
  "/bookings/",
  "/clients/",
  "/notifications",
  "/insights",
  "/waitlist",
];

/**
 * Map a notification's `data` to an in-app route, or null if it doesn't target
 * one. Pure + defensive (the payload is attacker-influenced JSON): only a
 * string booking id, or a `path` on the allowlist above, is honoured.
 */
export function notificationTarget(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as PushData;
  if (typeof d.booking_id === "string" && d.booking_id) {
    return `/bookings/${d.booking_id}`;
  }
  const path = d.path;
  if (
    typeof path === "string" &&
    PUSH_ROUTABLE_PREFIXES.some((p) => path === p || path.startsWith(p))
  ) {
    return path;
  }
  return null;
}

/**
 * Map a notification's web `cta_href` (a web-relative path, e.g.
 * /bookings/requests/:id) onto the equivalent in-app route, or null when it has
 * no mobile destination. Shared by the in-app feed (app/notifications.tsx) and
 * any future push payloads so both use ONE defensive resolver: only the known
 * web shapes plus the same allowlist as `notificationTarget` are honoured.
 */
export function webHrefToRoute(href: unknown): string | null {
  if (typeof href !== "string" || !href.startsWith("/")) return null;
  // Web booking detail -> mobile booking detail.
  const request = /^\/bookings\/requests\/([^/?#]+)$/.exec(href);
  if (request) return `/bookings/${request[1]}`;
  // Web booking settings (slots / books warnings) -> mobile booking settings.
  if (href === "/bookings/settings") return "/settings/books";
  if (PUSH_ROUTABLE_PREFIXES.some((p) => href === p || href.startsWith(p))) {
    return href;
  }
  return null;
}

/**
 * Ask for permission (once — never re-nags if denied), get this device's Expo
 * push token, and register it with the backend. Returns the token so the caller
 * can deregister it on sign-out, or null if push is unavailable (web, simulator,
 * permission denied, offline). Never throws.
 */
export async function registerPushTokenAsync(): Promise<string | null> {
  // Push tokens only exist for real iOS/Android devices; getExpoPushTokenAsync
  // throws on web/simulators, so bail before prompting.
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    if (Platform.OS === "android") {
      // A channel is required for Android notifications to display at all.
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: "#e9b22b",
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) {
      granted = (await Notifications.requestPermissionsAsync()).granted;
    }
    if (!granted) return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as
      | string
      | undefined;
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    await apiPost("/devices", {
      token,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? null,
    });
    return token;
  } catch (e) {
    captureError(e, { op: "registerPush" });
    return null;
  }
}

/** Remove this device's token on sign-out so it stops receiving pushes. */
export async function deregisterPushTokenAsync(token: string): Promise<void> {
  try {
    await apiDelete(`/devices?token=${encodeURIComponent(token)}`);
  } catch (e) {
    captureError(e, { op: "deregisterPush" });
  }
}

/**
 * Route to the screen a tapped notification points at. Handles both the warm
 * path (tapped while the app runs) and cold start (tapped while killed, via
 * getLastNotificationResponseAsync). `enabled` gates routing on the artist being
 * signed in + onboarded — a cold-start tap that arrives before /me resolves is
 * routed once `enabled` flips true (the same response is re-read, deduped by id).
 */
export function usePushResponseObserver(enabled: boolean): void {
  const router = useRouter();
  const handledId = useRef<string | null>(null);

  const route = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!enabled || !response) return;
      const id = response.notification.request.identifier;
      if (handledId.current === id) return; // don't double-navigate one tap
      const target = notificationTarget(
        response.notification.request.content.data,
      );
      if (!target) return;
      handledId.current = id;
      // Clear the persisted cold-start response so a later ordinary launch
      // (icon tap, no notification) doesn't re-read it and re-navigate here.
      void Notifications.clearLastNotificationResponseAsync();
      router.push(target as never);
    },
    [enabled, router],
  );

  useEffect(() => {
    let active = true;
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (active) route(r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(route);
    return () => {
      active = false;
      sub.remove();
    };
  }, [route]);
}
