"use client";

import { useEffect } from "react";
import { setPublicMapPlane } from "./collector";

/**
 * Publish the ANONYMOUS map plane to the collector (go-live plan S4 follow-up).
 *
 * `/map` and `/map/[id]` render for both audiences on the same path, so the
 * collector's prefix rules cannot classify them; only the server knows which
 * plane it just rendered. This hook carries that server-resolved fact
 * (`capabilities.isPublic`) into the client collector.
 *
 * It only ever publishes the PUBLIC plane. There is no authed counterpart on
 * purpose: the collector defaults to "not public", so an artist page that
 * forgets to mark itself is excluded rather than counted, and only an explicit
 * anonymous render opts in.
 */
export function usePublicMapPlane(isPublic: boolean): void {
  useEffect(() => {
    if (!isPublic) return;
    setPublicMapPlane(true);
    return () => setPublicMapPlane(false);
  }, [isPublic]);
}

/**
 * The same signal for a server-rendered anonymous page that has no client shell
 * of its own to hang the hook on (the public `/map/[id]` page). Rendered only
 * from an anonymous branch, so its presence IS the assertion.
 */
export default function PublicMapPlaneMarker() {
  usePublicMapPlane(true);
  return null;
}
