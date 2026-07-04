import { Platform } from "react-native";
import Constants from "expo-constants";
import { useApiQuery } from "./api";
import type { MobileMinVersion } from "@inklee/shared/app-version";

// The build's own version (baked from app.config `version` at build time), same
// source push.ts reports as `appVersion`.
const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
const PLATFORM = Platform.OS === "ios" ? "ios" : "android";

/**
 * Min-version kill-switch gate. Asks the server whether THIS build is still
 * supported for its platform. FAIL-OPEN: only an affirmative
 * updateRequired===true blocks; while the check is loading or if it errors
 * (offline, server down), the app runs normally, so a network blip can never
 * brick an installed build. There is no OTA, so raising the server's
 * MOBILE_MIN_VERSION above a bad build is the only way to recall it.
 */
export function useMinVersionGate(): {
  updateRequired: boolean;
  updateUrl: string | null;
} {
  const q = useApiQuery<MobileMinVersion>(
    `/min-version?platform=${PLATFORM}&version=${encodeURIComponent(APP_VERSION)}`,
    { enabled: true },
  );
  return {
    updateRequired: q.data?.updateRequired === true,
    updateUrl: q.data?.updateUrl ?? null,
  };
}
