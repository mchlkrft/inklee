"use client";

import { useEffect } from "react";

type Props = { slug: string };

function send(payload: Record<string, unknown>): void {
  try {
    if (process.env.NODE_ENV !== "production") return;
    if (
      process.env.NEXT_PUBLIC_VERCEL_ENV &&
      process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"
    )
      return;
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/artist-events/collect",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      void fetch("/api/artist-events/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // analytics must never break the page
  }
}

function safeReferrerDomain(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const ref = new URL(document.referrer);
    return ref.origin === window.location.origin ? undefined : ref.hostname;
  } catch {
    return undefined;
  }
}

export function HubAnalytics({ slug }: Props) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const tracked = target.closest<HTMLElement>("[data-track]");
      if (!tracked) return;

      const trackType = tracked.dataset.track;
      const trackKey = tracked.dataset.trackKey;
      if (!trackType || !trackKey) return;

      const event = trackType === "link" ? "link_click" : "block_click";
      const params = new URLSearchParams(window.location.search);

      send({
        slug,
        event,
        targetKey: trackKey,
        surface: "hub",
        hostname: window.location.hostname,
        referrerDomain: safeReferrerDomain(),
        utmSource: params.get("utm_source") || undefined,
        utmMedium: params.get("utm_medium") || undefined,
      });
    };

    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [slug]);

  return null;
}
