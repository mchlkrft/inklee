import { useApiQuery } from "./api";
import { APP_PLATFORM, APP_VERSION } from "./app-info";
import {
  isCapabilityEnabled,
  parseAppConfig,
  type Capability,
  type MobileAppConfig,
} from "@inklee/shared/app-config";

// The client half of the app-config plane (GET /api/mobile/config —
// docs/architecture/remote-config-plan.md §10.2). ALL capability reads go
// through here; no flag-name strings anywhere else in the app.
//
// FAIL-OPEN like the min-version gate it absorbed: while the fetch is loading,
// offline, or the server is down, parseAppConfig(null) yields the bundled
// defaults — nothing disabled, nobody blocked. Config here only ever HIDES
// entry points and explains; the authoritative switch for every capability is
// enforced server-side, so a stale or manipulated client changes nothing that
// matters.

// Dev-only override so development can force capability states without ever
// touching production config: EXPO_PUBLIC_DISABLED_CAPABILITIES=deposits,...
const DEV_DISABLED: string[] = __DEV__
  ? String(process.env.EXPO_PUBLIC_DISABLED_CAPABILITIES ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0)
  : [];

// One log line per distinct kill-list (config source + activation, no PII).
let lastLoggedKills = "";

/**
 * The current app config: bundled defaults until the launch fetch resolves,
 * then the server's answer (cached + deduped by TanStack Query, so every
 * consumer shares one request per launch/refocus).
 */
export function useAppConfig(): MobileAppConfig {
  const q = useApiQuery<unknown>(
    `/config?platform=${APP_PLATFORM}&version=${encodeURIComponent(APP_VERSION)}`,
  );
  const parsed = parseAppConfig(q.data);
  const config: MobileAppConfig =
    DEV_DISABLED.length === 0
      ? parsed
      : {
          ...parsed,
          disabledCapabilities: [
            ...new Set([...parsed.disabledCapabilities, ...DEV_DISABLED]),
          ],
        };

  const kills = config.disabledCapabilities.join(",");
  if (kills !== lastLoggedKills) {
    lastLoggedKills = kills;
    if (kills) console.log(`[app-config] disabled capabilities: ${kills}`);
  }
  return config;
}

/**
 * Min-version kill-switch gate (absorbed from the retired min-version.ts —
 * identical semantics, one request instead of two). FAIL-OPEN: only an
 * affirmative updateRequired===true blocks; loading/offline/server-down runs
 * the app normally, so a network blip can never brick an installed build.
 */
export function useAppConfigGate(): {
  updateRequired: boolean;
  updateUrl: string | null;
  config: MobileAppConfig;
} {
  const config = useAppConfig();
  return {
    updateRequired: config.updateRequired === true,
    updateUrl: config.updateUrl,
    config,
  };
}

/** True when the capability is not remotely paused. Entry-point visibility
 *  only — the server enforces regardless. */
export function useCapability(capability: Capability): boolean {
  return isCapabilityEnabled(useAppConfig(), capability);
}
