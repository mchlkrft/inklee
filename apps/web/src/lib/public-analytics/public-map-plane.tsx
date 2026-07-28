"use client";

import { useEffect } from "react";
import { setPublicMapPlane, trackPublicPageview } from "./collector";

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
    // Claim the pageview here rather than trusting effect ordering.
    //
    // The collector's own effect lives in the ROOT layout, and the first
    // version of this hook assumed React's children-before-parents effect
    // order would always put the marker first. That holds inside ONE commit,
    // but `(map)/loading.tsx` puts this subtree behind a Suspense boundary:
    // the layout commits with the fallback, the collector runs and sees no
    // plane, and by the time the shell streams in the effect has already run
    // and will not re-fire for an unchanged pathname. Measured in production
    // 2026-07-28: the control page recorded, every anonymous /map view did
    // not. Failing closed meant zero contamination and zero data.
    //
    // trackPublicPageview dedupes on the last recorded path and does not mark
    // a path as recorded when it bails out, so calling it from both places is
    // safe in either order: whichever runs once the plane is set wins, and the
    // other is a no-op.
    trackPublicPageview(window.location.pathname);
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
