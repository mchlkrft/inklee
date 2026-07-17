// Promoted to the shared package (Phase 2 of the 2.0 map track) so web and
// native render the same branded basemap. This re-export keeps every existing
// native import path working.
export { brandMapStyle, mapInk, type MapInk } from "@inklee/shared/map-style";
