import { Platform } from "react-native";
import Constants from "expo-constants";

// Single source for the build's own identity (version baked from app.json at
// build time). Consumed by the API client's version headers, the app-config
// gate, and push device registration — so the reported version can never
// disagree between surfaces.
export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";
export const APP_PLATFORM: "android" | "ios" =
  Platform.OS === "ios" ? "ios" : "android";
