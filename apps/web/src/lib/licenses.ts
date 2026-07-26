import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Verbatim upstream licence texts, served on /data-attribution.
 *
 * These files are DOWNLOADED, never hand-written. Re-fetch from the canonical
 * source if they ever need updating, and never edit them in place:
 *
 *   apache-2.0.txt          https://www.apache.org/licenses/LICENSE-2.0.txt
 *   cdla-permissive-2.0.txt https://raw.githubusercontent.com/spdx/license-list-data/main/text/CDLA-Permissive-2.0.txt
 *
 * Why each one is here:
 *  - Apache-2.0 section 4(a) requires giving recipients a copy of the licence.
 *    It covers the Foursquare-sourced rows inside Overture Places.
 *  - CDLA-Permissive-2.0 section 2.1 requires making the text of the agreement
 *    available with shared Data. It covers the Overture Places rows.
 *
 * ODbL is deliberately absent. Counsel confirmed 2026-07-26 that a Produced
 * Work owes attribution plus an indication of the licence, which the credit
 * line and its link already discharge, so no verbatim copy is owed for the
 * OpenStreetMap-derived rows.
 */

export type VendoredLicenseId = "apache-2.0" | "cdla-permissive-2.0";

const LICENSE_DIR = path.join(process.cwd(), "content", "licenses");

const TITLES: Record<VendoredLicenseId, string> = {
  "apache-2.0": "Apache License, Version 2.0",
  "cdla-permissive-2.0":
    "Community Data License Agreement, Permissive, Version 2.0",
};

export type VendoredLicense = {
  id: VendoredLicenseId;
  title: string;
  /** The licence text exactly as published upstream. */
  text: string;
};

export function getLicense(id: VendoredLicenseId): VendoredLicense {
  const text = fs.readFileSync(path.join(LICENSE_DIR, `${id}.txt`), "utf8");
  return { id, title: TITLES[id], text };
}

/** Both vendored licences, in the order they appear on the attribution page. */
export function getVendoredLicenses(): VendoredLicense[] {
  return [getLicense("cdla-permissive-2.0"), getLicense("apache-2.0")];
}
