// Deployment flag for the Inklee 2.0 tattoo map (Phase 2+). Fail-closed
// literal env read, the proven studio-features pattern: the flag is ON only
// when the env var is exactly "true". Default OFF everywhere; the founder
// flips it per environment in Vercel. Routes gated by it must notFound()
// when off, and server routes must re-check it (defense in depth).
//
// This is a launch gate, not an operational kill-switch: when the MOBILE map
// surface ships, a `tattoo_map` capability gets registered in the capability
// plane (docs/architecture/capability-registry.md) and this env flag retires
// per the one-owner-per-behavior rule.
export function tattooMapEnabled(): boolean {
  return process.env.NEXT_PUBLIC_TATTOO_MAP === "true";
}

// Immersive map shell (map redesign Slice 1): the full-viewport canvas + rail +
// detail panel + URL state, built on the one shared map core. Fail-closed,
// default OFF everywhere and additive to `tattooMapEnabled()` — it only has any
// effect while the tattoo map itself is on. When off, `/map` renders the
// existing boxed discovery card byte-identically. The founder flips it per
// environment in Vercel once the new core is verified; retiring the legacy
// boxed client happens only after that.
export function mapImmersiveShellEnabled(): boolean {
  return (
    tattooMapEnabled() && process.env.NEXT_PUBLIC_MAP_IMMERSIVE_SHELL === "true"
  );
}

// Server-only perf flag (map redesign Slice 2): route the viewport pins query
// to the index-using v2 RPCs (migration 0101). NOT NEXT_PUBLIC — it never
// reaches the client and fails closed to the proven v1 functions. Flip on only
// after staging validation (EXPLAIN shows the GiST index scan + v1/v2 parity);
// rollback is flipping it back off. Read only in the server API route.
export function mapPinsV2Enabled(): boolean {
  return process.env.MAP_PINS_V2 === "true";
}
