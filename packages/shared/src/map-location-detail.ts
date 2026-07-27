// The map location detail read-model types (map redesign Slice 1), promoted to
// the shared package so web (the immersive detail panel + /map/[id]) and native
// (the discovery map detail sheet + /api/mobile/map wire types) consume ONE
// shape. The server read-model that produces it stays in
// apps/web/src/lib/server/map-location-detail.ts; the sub-shape producers
// (studio-styles, guest-spots timeline) re-export these types so the wire and
// the producers cannot drift.

export type StudioStyleChip = { key: string; label: string };

export type GuestStyleChip = StudioStyleChip & {
  count: number;
  showCount: boolean;
};

export type StudioStylesForDisplay = {
  specialties: StudioStyleChip[];
  guestStyles: GuestStyleChip[];
  isEmpty: boolean;
};

export type TimelineEntry = {
  // null name = the artist opted out of naming (guest_naming_opt_out).
  name: string | null;
  slug: string | null;
  startsOn: string;
  endsOn: string;
};

export type StudioTimeline = {
  current: TimelineEntry[];
  upcoming: TimelineEntry[];
  past: TimelineEntry[];
};

// Public/authed plane split (go-live plan S1): the SHARED detail is the
// viewer-independent payload both planes agree on; the viewer state is an
// authed-only decoration. The public data plane serves MapLocationDetailShared
// so an anonymous (and CDN-cacheable) response STRUCTURALLY cannot carry
// viewer data; the authed wire shape (web panel + /api/mobile/map) is the
// composition and stays byte-compatible with what shipped before the split.

export type MapLocationDetailShared = {
  id: string;
  name: string;
  category: string;
  claimed: boolean;
  /** Seed pin nobody has claimed: its details are a snapshot, so we say so. */
  unverified: boolean;
  /** When an owner last confirmed the data (claim or edit); null for seeds. */
  lastConfirmedAt: string | null;
  /** An admin flagged this from a "closed"/"outdated" report; a soft warning. */
  possiblyClosed: boolean;
  signal: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  instagram: string | null;
  phone: string | null;
  openingHours: string | null;
  styles: StudioStylesForDisplay | null;
  houseRules: { key: string; content: string }[];
  timeline: StudioTimeline | null;
  requestable: boolean;
};

/** Viewer-dependent decoration; never part of a public payload. */
export type MapViewerLocationState = {
  watched: boolean;
  ownStudio: boolean;
};

/**
 * The runtime key list of the viewer decoration, for structural-subset tests:
 * a public detail payload must contain NONE of these keys.
 */
export const VIEWER_DETAIL_KEYS = ["watched", "ownStudio"] as const;

export type MapLocationDetail = MapLocationDetailShared &
  MapViewerLocationState;
