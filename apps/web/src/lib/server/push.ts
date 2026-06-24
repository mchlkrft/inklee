import { serviceClient } from "@/lib/supabase/service";

// DRIFT-01: the server send-half of mobile push. Device registration (mobile
// push.ts -> /api/mobile/devices, migration 0046) was already in place, but
// nothing fanned notifications out to Expo, so no device ever received a push.
// This reads an artist's registered tokens and POSTs to the Expo push service,
// pruning any token Expo reports as DeviceNotRegistered.
//
// Best-effort by design: push is a side channel on top of the in-app
// notification feed + email, so this never throws and never blocks the caller's
// result. Actual delivery still requires the FCM (Android) / APNs (iOS)
// credentials uploaded to EAS; until then Expo accepts the message but cannot
// deliver it.

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export type ArtistPush = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

function isExpoToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (value.startsWith("ExponentPushToken[") ||
      value.startsWith("ExpoPushToken["))
  );
}

export async function sendPushToArtist(
  artistId: string,
  push: ArtistPush,
): Promise<void> {
  try {
    const { data: rows } = await serviceClient
      .from("device_tokens")
      .select("token")
      .eq("artist_id", artistId);

    const tokens = (rows ?? [])
      .map((r) => (r as { token: unknown }).token)
      .filter(isExpoToken);
    if (tokens.length === 0) return;

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
      const slice = tokens.slice(i, i + BATCH_SIZE);
      const messages = slice.map((to) => ({
        to,
        title: push.title,
        body: push.body,
        sound: "default" as const,
        ...(push.data ? { data: push.data } : {}),
      }));

      let res: Response;
      try {
        res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(messages),
        });
      } catch {
        continue; // network blip — the in-app notification already landed
      }
      if (!res.ok) continue;

      const json = (await res.json().catch(() => null)) as {
        data?: Array<{ status?: string; details?: { error?: string } }>;
      } | null;
      const tickets = json?.data ?? [];

      // Prune tokens Expo says are dead so the table doesn't accumulate stale
      // entries (and a future delivery isn't wasted on them).
      const dead: string[] = [];
      tickets.forEach((ticket, idx) => {
        if (
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered"
        ) {
          const tok = slice[idx];
          if (tok) dead.push(tok);
        }
      });
      if (dead.length > 0) {
        await serviceClient
          .from("device_tokens")
          .delete()
          .eq("artist_id", artistId)
          .in("token", dead);
      }
    }
  } catch {
    // swallow: push must never break the notification/email path.
  }
}
