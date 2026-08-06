import { describe, it, expect } from "vitest";
import {
  isDroppableSentryNoise,
  isExploitProbeUrl,
  isServerActionNotFound,
  SERVER_ACTION_NOT_FOUND_MESSAGE,
} from "../sentry-noise";

describe("isExploitProbeUrl", () => {
  it("matches the observed Joomla SP Page Builder probe (path and query)", () => {
    // The exact request that paged us on 2026-08-05.
    expect(
      isExploitProbeUrl(
        "https://inklee.app/index.php?option=com_sppagebuilder&task=asset.uploadCustomIcon&nxtPslug=index.php",
      ),
    ).toBe(true);
  });

  it("matches common WordPress / PHP / env scans", () => {
    for (const url of [
      "https://inklee.app/wp-login.php",
      "https://inklee.app/wp-admin/",
      "https://inklee.app/xmlrpc.php",
      "https://inklee.app/.env",
      "https://inklee.app/.git/config",
      "https://inklee.app/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php",
      "https://inklee.app/administrator/index.php",
    ]) {
      expect(isExploitProbeUrl(url), url).toBe(true);
    }
  });

  it("does NOT match legitimate inklee urls, including real artist pages", () => {
    for (const url of [
      "https://inklee.app/",
      "https://inklee.app/some-artist-handle",
      "https://inklee.app/some-artist/flash",
      "https://inklee.app/pricing",
      "https://inklee.app/settings/payouts",
      "https://inklee.app/api/stripe/webhook",
    ]) {
      expect(isExploitProbeUrl(url), url).toBe(false);
    }
  });

  it("is null/undefined-safe", () => {
    expect(isExploitProbeUrl(null)).toBe(false);
    expect(isExploitProbeUrl(undefined)).toBe(false);
    expect(isExploitProbeUrl("")).toBe(false);
  });
});

describe("isServerActionNotFound", () => {
  it("matches the stale-deployment / blind-POST error message", () => {
    expect(
      isServerActionNotFound([
        `${SERVER_ACTION_NOT_FOUND_MESSAGE}. This request might be from an older or newer deployment.`,
      ]),
    ).toBe(true);
  });

  it("ignores unrelated errors and empty message lists", () => {
    expect(
      isServerActionNotFound(["TypeError: cannot read x of undefined"]),
    ).toBe(false);
    expect(isServerActionNotFound([null, undefined])).toBe(false);
    expect(isServerActionNotFound([])).toBe(false);
  });
});

describe("isDroppableSentryNoise", () => {
  it("drops the observed scanner event (probe url + server-action error)", () => {
    expect(
      isDroppableSentryNoise({
        exceptionMessages: [
          "Failed to find Server Action. This request might be from an older or newer deployment.",
        ],
        requestUrl:
          "https://inklee.app/index.php?option=com_sppagebuilder&task=asset.uploadCustomIcon",
      }),
    ).toBe(true);
  });

  it("drops on the url alone even if the message is not populated", () => {
    expect(
      isDroppableSentryNoise({
        exceptionMessages: [],
        requestUrl: "https://inklee.app/wp-login.php",
      }),
    ).toBe(true);
  });

  it("KEEPS a genuine application error on a real page", () => {
    expect(
      isDroppableSentryNoise({
        exceptionMessages: ["TypeError: undefined is not a function"],
        requestUrl: "https://inklee.app/some-artist-handle",
      }),
    ).toBe(false);
  });
});
