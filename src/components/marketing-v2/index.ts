"use client";

// Marked as a client boundary so the PillNav re-export below carries
// its client directive through reliably. Without this directive on
// the barrel itself, Next.js was treating PillNav as a server
// component, useEffect never ran, and the scroll affordance stayed
// flat. SiteFooter and ComparePageContent are render-only with no
// client logic, so making them client adds negligible bundle weight.

export { default as PillNav } from "./pill-nav";
export { default as SiteFooter } from "./site-footer";
export { default as ComparePageContent } from "./compare-page";
export type { ComparePageProps } from "./compare-page";
