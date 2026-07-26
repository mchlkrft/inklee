// Deployment flag for the Inklee 2.0 tattoo map (Phase 2+). Fail-closed
// literal env read, the proven studio-features pattern: the flag is ON only
// when the env var is exactly "true". Default OFF everywhere; the founder
// flips it per environment in Vercel. Routes gated by it must notFound()
// when off, and server routes must re-check it (defense in depth).
//
// This is a launch gate, not an operational kill-switch. Ratified split
// (2026-07-26, native map ship): this env flag stays the PLATFORM launch gate
// for the tattoo map (web routes AND the /api/mobile/map/* twins re-check it),
// while the `tattoo_map` capability (docs/architecture/capability-registry.md)
// is the NATIVE operational kill switch layered on top. Two owners, two
// behaviors: "is the map launched" vs "pause the native surface".
export function tattooMapEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TATTOO_MAP === "true";
}

// Is the tattoo map reachable WITHOUT an account? Third gate in the same
// family, and the one the public marketing site reads: `tattooMapEnabled()`
// answers "does the tattoo map exist", the `tattoo_map` capability answers
// "pause the native surface", and this one answers "can an anonymous visitor
// open /map".
//
// It exists because today the answer is NO: every map route lives under
// apps/web/src/app/(artist)/, whose layout redirects anonymous visitors to
// /login, and all four /api/map/* handlers 401 without a cookie user. The
// public shell is the last step of the map rollout. Its data-licensing gate is
// CLOSED (attribution only, no share-alike; answered 2026-07-24, premise
// corrected and re-confirmed 2026-07-26 after 3,582 approved studios turned out
// to be OSM-Overpass-derived —
// docs/counsel-note-public-map-osm-correction-2026-07-26.md). What remains is
// engineering, so every public-facing link to /map is built behind this flag and
// renders nothing until the flag is on.
//
// AND-ed with the platform gate on purpose: a public map cannot be reachable
// while the map itself is off, so a stray NEXT_PUBLIC_PUBLIC_MAP=true can never
// publish links on its own. Fail-closed, default OFF everywhere.
//
// DO NOT FLIP until (a) the studio-data credit component + /data-attribution
// page + GDPR Art. 14/21 surface ship, (b) per-row provenance reaches
// map_locations, and (c) a public /map route actually exists outside (artist).
// Flipping it early publishes navigation, footer and CTA links that bounce
// anonymous visitors to /login, and publishes seeded rows with no licence
// notice.
//
// Full reasoning: docs/marketing/public-map-marketing-integration-audit.md.
export function publicMapEnabled(): boolean {
  return tattooMapEnabled() && process.env.NEXT_PUBLIC_PUBLIC_MAP === "true";
}

// RETIRED 2026-07-25: `mapImmersiveShellEnabled()` + NEXT_PUBLIC_MAP_IMMERSIVE_SHELL.
// The immersive shell soaked in prod (flipped 2026-07-22, founder-verified) and
// is now THE discovery surface whenever `tattooMapEnabled()`; the legacy boxed
// discovery client was deleted with it. The env var can be removed from Vercel
// at leisure (it is no longer read). The classic journey map remains the
// tattooMapEnabled()-off kill-switch fallback.

// Server-only perf flag (map redesign Slice 2): route the viewport pins query
// to the index-using v2 RPCs (migration 0101). NOT NEXT_PUBLIC — it never
// reaches the client and fails closed to the proven v1 functions. Flip on only
// after staging validation (EXPLAIN shows the GiST index scan + v1/v2 parity);
// rollback is flipping it back off. Read only in the server API route.
export function mapPinsV2Enabled(): boolean {
  return process.env.MAP_PINS_V2 === "true";
}
