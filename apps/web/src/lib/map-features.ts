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
