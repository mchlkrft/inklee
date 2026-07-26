/**
 * One source of truth for the tattoo directory's DATA attribution.
 *
 * This is the studio-data credit. It is NOT the basemap tile credit (MapLibre /
 * CARTO / OpenStreetMap), which is a separate obligation already satisfied by
 * the attribution pill on the map canvas. Both must be present on a public map.
 *
 * Wording approved by counsel 2026-07-26 on corrected facts
 * (docs/counsel-note-public-map-osm-correction-2026-07-26.md §8). The earlier
 * 2026-07-24 string omitted OpenStreetMap on a premise that turned out to be
 * false: 3,582 approved studios come solely from a direct OSM Overpass lane.
 * DO NOT drop OSM from this string, and do not edit it without a counsel note.
 *
 * Obligations it discharges:
 *  - ODbL 1.0 (OpenStreetMap): attribution on a Produced Work.
 *  - CDLA-Permissive-2.0 (Overture): attribution and licence preservation.
 *  - Apache-2.0 (Foursquare-sourced rows): NOTICE preservation, a copy of the
 *    licence, and a statement that files were changed with dates. The "modified
 *    by Inklee" clause carries the change statement; the dated form and the
 *    licence copies live on the linked page.
 */

/** Where the full licences, notices and the change statement live. */
export const DATA_ATTRIBUTION_PATH = "/data-attribution";

/** Short label for the link that follows the credit line. */
export const DATA_ATTRIBUTION_LINK_LABEL = "Licences and notices";

/**
 * The approved studio-data credit, verbatim. Render this followed by a link to
 * DATA_ATTRIBUTION_PATH labelled DATA_ATTRIBUTION_LINK_LABEL.
 */
export const STUDIO_DATA_CREDIT =
  "Studio data © OpenStreetMap contributors (ODbL), Overture Maps Foundation (CDLA-Permissive-2.0) and Foursquare Labs, Inc. (Apache-2.0), modified by Inklee.";

/** Apache-2.0 NOTICE text that must be preserved for Foursquare-sourced rows. */
export const FOURSQUARE_NOTICE =
  "Copyright 2024 Foursquare Labs, Inc. All rights reserved.";

/**
 * Month the seeding lane began writing reviewed rows. Used for the Apache-2.0
 * "stated changes, with dates" requirement, which wants a date rather than a
 * bare claim that files were modified.
 */
export const MODIFICATION_SINCE = "July 2026";

export type DirectorySource = {
  key: "openstreetmap" | "overture" | "foursquare";
  name: string;
  licence: string;
  licenceUrl: string;
  /** What Inklee takes from this source. Facts only, by standing policy. */
  taken: string;
  homeUrl: string;
};

/**
 * The three upstream sources behind seeded studio entries. Kept in this order
 * so the rendered table matches the credit line.
 */
export const DIRECTORY_SOURCES: DirectorySource[] = [
  {
    key: "openstreetmap",
    name: "OpenStreetMap contributors",
    licence: "ODbL 1.0",
    licenceUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    taken: "Studio name and position, from a bounded search for tattoo shops.",
    homeUrl: "https://www.openstreetmap.org/copyright",
  },
  {
    key: "overture",
    name: "Overture Maps Foundation",
    licence: "CDLA-Permissive-2.0",
    licenceUrl:
      "https://cdla.dev/permissive-2-0/",
    taken: "Studio name and position from the Places theme.",
    homeUrl: "https://overturemaps.org/",
  },
  {
    key: "foursquare",
    name: "Foursquare Labs, Inc.",
    licence: "Apache-2.0",
    licenceUrl: "https://www.apache.org/licenses/LICENSE-2.0",
    taken: "Studio name and position, for rows Overture sources from Foursquare.",
    homeUrl: "https://foursquare.com/",
  },
];

/**
 * Facts Inklee publishes from a seeded row. Standing policy from the counsel
 * note: publish facts, never the source database, and never source-authored
 * content. Rendered on the attribution page so the limit is visible.
 */
export const PUBLISHED_SEED_FIELDS = [
  "The studio name.",
  "A map position. Studios set to an approximate location show an offset point, never their exact address.",
  "The city and country.",
];

/** What never reaches a public page from a source, by standing policy. */
export const NEVER_PUBLISHED_FROM_SOURCES = [
  "Descriptions written by the source.",
  "Photos.",
  "Opening hours.",
  "Ratings or reviews.",
  "The source's own category taxonomy.",
];
