// @inklee/shared — pure, platform-agnostic TS shared by apps/web and apps/mobile.
// Prefer subpath imports (e.g. "@inklee/shared/platform-fee") to keep tree-shaking
// and avoid cross-module name collisions; this barrel is a convenience surface.
export * from "./booking-fsm";
export * from "./booking-schema";
export * from "./platform-fee";
export * from "./entitlements";
export * from "./deposit-policy";
export * from "./deposit-settings";
export * from "./connect-countries";
export * from "./connect-requirements";
export * from "./notification-types";
export * from "./status-labels";
export * from "./booking-domain";
export * from "./date-utils";
export * from "./timezone";
export * from "./format";
export * from "./slug";
export * from "./trip-validation";
export * from "./studio-validation";
export * from "./custom-fields";
export * from "./books-settings";
export * from "./dashboard-settings";
export * from "./auth-derivations";
export * from "./auth-validation";
export * from "./profile-validation";
export * from "./cover-colors";
