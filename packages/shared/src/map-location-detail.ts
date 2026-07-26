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

export type MapLocationDetail = {
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
  watched: boolean;
  styles: StudioStylesForDisplay | null;
  houseRules: { key: string; content: string }[];
  timeline: StudioTimeline | null;
  requestable: boolean;
  ownStudio: boolean;
};
