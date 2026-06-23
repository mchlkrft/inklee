"use client";

import { useEffect, useRef } from "react";
import type { TravelMapStop } from "@inklee/shared/travel-map";
import { googleMapsNavUrl } from "@inklee/shared/travel-map";
import { INKLEE_ICON_ART } from "@inklee/shared/inklee-icon-art";
import { BRAND, PAST_GREY, VOYAGER_STYLE, onPinText } from "./map-style";

// MapLibre is loaded at runtime from a CDN (the GooglePlacesPicker pattern), so
// no npm dependency is needed. The base style is CARTO Voyager (OSM-based, no
// key), brand-tinted + theme-aware at load.
const MAPLIBRE_VERSION = "4.7.1";
const MAPLIBRE_JS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;

interface MlMarkerOptions {
  element?: HTMLElement;
  anchor?: string;
}
interface MlMarker {
  setLngLat(c: [number, number]): MlMarker;
  setPopup(p: MlPopup): MlMarker;
  addTo(m: MlMap): MlMarker;
  remove(): void;
}
interface MlPopup {
  setHTML(html: string): MlPopup;
}
interface MlMap {
  addControl(c: unknown): void;
  on(type: string, listener: () => void): void;
  addSource(id: string, source: Record<string, unknown>): void;
  addLayer(layer: Record<string, unknown>, beforeId?: string): void;
  getStyle(): { layers?: Array<{ id: string; type: string }> } | undefined;
  getZoom(): number;
  fitBounds(
    bounds: [[number, number], [number, number]],
    opts?: Record<string, unknown>,
  ): void;
  remove(): void;
}
interface MlGlobal {
  Map: new (opts: Record<string, unknown>) => MlMap;
  Marker: new (opts?: MlMarkerOptions) => MlMarker;
  Popup: new (opts?: Record<string, unknown>) => MlPopup;
  NavigationControl: new () => unknown;
}
declare global {
  interface Window {
    maplibregl?: MlGlobal;
  }
}

function loadMapLibre(): Promise<MlGlobal> {
  return new Promise((resolve, reject) => {
    if (window.maplibregl) return resolve(window.maplibregl);
    if (!document.querySelector(`link[data-maplibre]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS;
      link.setAttribute("data-maplibre", "1");
      document.head.appendChild(link);
    }
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-maplibre]",
    );
    if (existing) {
      existing.addEventListener("load", () =>
        window.maplibregl
          ? resolve(window.maplibregl)
          : reject(new Error("maplibre missing")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = MAPLIBRE_JS;
    script.async = true;
    script.setAttribute("data-maplibre", "1");
    script.onload = () =>
      window.maplibregl
        ? resolve(window.maplibregl)
        : reject(new Error("maplibre missing"));
    script.onerror = () => reject(new Error("Failed to load the map library."));
    document.head.appendChild(script);
  });
}

function isDarkSurface(hex: string): boolean {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

// Brand-tint the basemap (land + water) per theme, keeping the Google-like
// road/label structure. Best-effort: unknown shapes pass through.
function brandPatchStyle(style: unknown, isDark: boolean): unknown {
  const land = isDark ? BRAND.charcoal : BRAND.bone;
  const water = isDark ? "#16263d" : "#cdd9ec";
  try {
    const layers = (style as { layers?: Array<Record<string, unknown>> })
      .layers;
    if (!Array.isArray(layers)) return style;
    for (const layer of layers) {
      const id = String(layer.id ?? "");
      if (id === "background") {
        layer.paint = { ...(layer.paint as object), "background-color": land };
      } else if (layer.type === "fill" && /water/.test(id)) {
        layer.paint = { ...(layer.paint as object), "fill-color": water };
      }
    }
  } catch {
    // leave the style as-is on any unexpected shape
  }
  return style;
}

function themedStyleUrl(isDark: boolean): string {
  return isDark
    ? VOYAGER_STYLE.replace("voyager-gl-style", "dark-matter-gl-style")
    : VOYAGER_STYLE;
}

async function resolveStyle(isDark: boolean): Promise<unknown> {
  const url = themedStyleUrl(isDark);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`style ${res.status}`);
    return brandPatchStyle(await res.json(), isDark);
  } catch {
    return url; // let MapLibre fetch it (no brand tint)
  }
}

// --- marker + popover ------------------------------------------------------

function makeMarkerAccessible(el: HTMLElement, ariaLabel: string): void {
  el.className = "inklee-marker";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", ariaLabel);
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      el.click();
    }
  });
}

function pinElement(
  color: string,
  label: string,
  ariaLabel: string,
  name: string,
  dimmed: boolean,
): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText =
    "cursor:pointer;display:flex;flex-direction:column;align-items:center;";
  const nameTag = name
    ? `<div class="inklee-pin-name" style="margin-bottom:3px;max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 7px;border-radius:9999px;background:var(--popover);color:${dimmed ? "var(--muted-foreground)" : "var(--popover-foreground)"};font:600 11px/1.4 var(--font-sans);box-shadow:0 1px 2px rgba(0,0,0,.25);">${escapeHtml(name)}</div>`
    : "";
  el.innerHTML = `${nameTag}
    <div style="position:relative;width:34px;height:46px;${dimmed ? "opacity:.9;" : ""}">
      <svg width="34" height="46" viewBox="0 0 34 46" style="display:block;filter:drop-shadow(0 2px 3px rgba(0,0,0,.32));">
        <path d="M17 1C8.7 1 2 7.7 2 16c0 11 13.4 26.3 14.4 27.4.3.4.9.4 1.2 0C18.6 42.3 32 27 32 16 32 7.7 25.3 1 17 1z" fill="${color}"/>
      </svg>
      <span style="position:absolute;top:7px;left:0;width:34px;text-align:center;color:${onPinText(color)};font:800 15px/1 var(--font-sans);">${label}</span>
    </div>`;
  makeMarkerAccessible(el, ariaLabel);
  return el;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const POP_FG = "var(--popover-foreground)";
const POP_MUTED = "var(--muted-foreground)";

function injectPopupStyles(): void {
  if (document.getElementById("inklee-map-popup")) return;
  const s = document.createElement("style");
  s.id = "inklee-map-popup";
  s.textContent = `
.inklee-popup .maplibregl-popup-content{background:var(--popover);color:var(--popover-foreground);border-radius:18px;padding:18px 18px 16px;box-shadow:0 12px 36px rgba(0,0,0,.28);border:1px solid var(--border);}
.inklee-popup .maplibregl-popup-close-button{color:var(--popover-foreground);font-size:22px;width:30px;height:30px;line-height:24px;right:6px;top:6px;border-radius:9999px;}
.inklee-popup .maplibregl-popup-close-button:hover{background:color-mix(in oklab, var(--popover-foreground) 12%, transparent);color:var(--popover-foreground);}
.inklee-popup.maplibregl-popup-anchor-bottom .maplibregl-popup-tip,.inklee-popup.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip,.inklee-popup.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip{border-top-color:var(--popover);}
.inklee-popup.maplibregl-popup-anchor-top .maplibregl-popup-tip,.inklee-popup.maplibregl-popup-anchor-top-left .maplibregl-popup-tip,.inklee-popup.maplibregl-popup-anchor-top-right .maplibregl-popup-tip{border-bottom-color:var(--popover);}
.inklee-popup.maplibregl-popup-anchor-left .maplibregl-popup-tip{border-right-color:var(--popover);}
.inklee-popup.maplibregl-popup-anchor-right .maplibregl-popup-tip{border-left-color:var(--popover);}
.inklee-marker:focus-visible{outline:2px solid var(--ring);outline-offset:2px;border-radius:8px;}
`;
  document.head.appendChild(s);
}

function chip(label: string, color: string): string {
  return `<span style="display:inline-flex;align-items:center;gap:7px;font:600 13px/1 var(--font-sans);color:${POP_FG};">
    <span style="width:11px;height:11px;border-radius:9999px;background:${color};display:inline-block;box-shadow:0 0 0 2px var(--popover);"></span>${escapeHtml(label)}</span>`;
}

function badgePills(labels: string[]): string {
  if (!labels.length) return "";
  return `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">${labels
    .map(
      (b) =>
        `<span style="font:600 11px/1.4 var(--font-sans);color:${POP_FG};border:1px solid var(--border);border-radius:9999px;padding:3px 10px;text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(
          b,
        )}</span>`,
    )
    .join("")}</div>`;
}

function navButton(href: string): string {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="bg-brand-mustard text-brand-charcoal"
    style="margin-top:14px;display:block;text-align:center;font:600 14px/1 var(--font-sans);text-decoration:none;padding:12px 16px;border-radius:9999px;">
    Open in Google Maps &#8599;</a>`;
}

function card(inner: string): string {
  return `<div style="min-width:248px;max-width:312px;color:${POP_FG};font-family:var(--font-sans);">${inner}</div>`;
}

const TIMEFRAME_LABEL: Record<string, string> = {
  upcoming: "Upcoming",
  current: "Now",
  previous: "Past",
};

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function fmtRange(s: string | null, e: string | null): string {
  if (s && e) return `${fmtDate(s)} to ${fmtDate(e)}`;
  if (s) return `From ${fmtDate(s)}`;
  if (e) return `Until ${fmtDate(e)}`;
  return "Ongoing";
}

function stopPopupHtml(stop: TravelMapStop, isDark: boolean): string {
  const place = [stop.city, stop.country].filter(Boolean).join(", ");
  const past = stop.timeframe === "previous";
  // Inklee link color: charcoal on the light/bone card, mustard on the dark card.
  const linkColor = isDark ? BRAND.mustard : BRAND.charcoal;
  const art = stop.icon ? INKLEE_ICON_ART[stop.icon] : undefined;
  const iconSvg = art
    ? `<span style="display:inline-flex;width:24px;height:24px;flex:none;color:${stop.iconColor || POP_FG};"><svg viewBox="${art.viewBox}" fill="currentColor" style="width:100%;height:100%;" aria-hidden="true">${art.inner}</svg></span>`
    : "";
  const n = stop.bookingCount;
  const bookings = `<a href="/bookings/requests" style="display:inline-block;margin-top:10px;font:600 13px/1.3 var(--font-sans);color:${linkColor};text-decoration:underline;text-underline-offset:2px;">${n} ${n === 1 ? "booking" : "bookings"} during this trip &#8599;</a>`;
  const mapsHref =
    stop.googleMapsUrl || googleMapsNavUrl(stop.latitude, stop.longitude);
  return card(
    `<div style="display:flex;align-items:center;gap:9px;margin-bottom:6px;padding-right:26px;">${iconSvg}<div style="font:800 17px/1.2 var(--font-sans);color:${POP_FG};">${escapeHtml(
      stop.name,
    )}</div></div>
    <div style="margin-bottom:5px;">${chip(stop.tripTitle, past ? PAST_GREY : BRAND.mustard)}</div>
    ${place ? `<div style="font:500 13px/1.4 var(--font-sans);color:${POP_MUTED};">${escapeHtml(place)}</div>` : ""}
    <div style="font:500 13px/1.4 var(--font-sans);color:${POP_MUTED};">${escapeHtml(
      fmtRange(stop.startsAt, stop.endsAt),
    )}</div>
    ${badgePills([TIMEFRAME_LABEL[stop.timeframe]])}
    <div>${bookings}</div>
    ${navButton(mapsHref)}`,
  );
}

function boundsOf(
  points: Array<[number, number]>,
): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

export default function MapClient({ journey }: { journey: TravelMapStop[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MlMap | null = null;
    let markers: MlMarker[] = [];
    let cancelled = false;

    (async () => {
      const isDark = isDarkSurface(
        getComputedStyle(container).getPropertyValue("--background"),
      );
      const style = await resolveStyle(isDark);
      const ml = await loadMapLibre();
      if (cancelled) return;

      map = new ml.Map({
        container,
        style,
        center: [13.405, 52.52],
        zoom: 1.6,
      });
      const theMap = map;
      theMap.addControl(new ml.NavigationControl());
      injectPopupStyles();

      const journeyEls: HTMLElement[] = [];
      journey.forEach((stop, i) => {
        const past = stop.timeframe === "previous";
        const color = past ? PAST_GREY : BRAND.mustard;
        const place = [stop.city, stop.country].filter(Boolean).join(", ");
        const name = stop.city ?? stop.name;
        const ariaLabel = `Stop ${i + 1}: ${stop.name}${place ? `, ${place}` : ""}${past ? " (visited)" : ""}`;
        const el = pinElement(color, String(i + 1), ariaLabel, name, past);
        journeyEls.push(el);
        const marker = new ml.Marker({ element: el, anchor: "bottom" })
          .setLngLat([stop.longitude, stop.latitude])
          .setPopup(
            new ml.Popup({
              offset: 40,
              maxWidth: "340px",
              className: "inklee-popup",
            }).setHTML(stopPopupHtml(stop, isDark)),
          )
          .addTo(theMap);
        markers.push(marker);
      });

      // Declutter by zoom: below PIN_ZOOM only the trail shows; pins appear as
      // you zoom into a region, name tags only once close.
      const PIN_ZOOM = 3;
      const LABEL_ZOOM = 4.5;
      const applyZoomVisibility = () => {
        const z = theMap.getZoom();
        for (const el of journeyEls) {
          el.style.display = z >= PIN_ZOOM ? "flex" : "none";
          const tag = el.querySelector(".inklee-pin-name");
          if (tag instanceof HTMLElement) {
            tag.style.display = z >= LABEL_ZOOM ? "" : "none";
          }
        }
      };
      theMap.on("zoom", applyZoomVisibility);
      applyZoomVisibility();

      theMap.on("load", () => {
        if (cancelled) return;

        if (journey.length >= 2) {
          const layers = theMap.getStyle()?.layers ?? [];
          let lastBoundary = -1;
          layers.forEach((l, i) => {
            if (/boundary|admin/i.test(l.id)) lastBoundary = i;
          });
          const beforeId =
            layers.find((l, i) => i > lastBoundary && l.type === "symbol")
              ?.id ?? layers.find((l) => l.type === "symbol")?.id;
          const addRoute = (
            id: string,
            stops: TravelMapStop[],
            paint: Record<string, unknown>,
          ) => {
            if (stops.length < 2) return;
            theMap.addSource(id, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: stops.map(
                    (s) => [s.longitude, s.latitude] as [number, number],
                  ),
                },
              },
            });
            theMap.addLayer(
              {
                id,
                type: "line",
                source: id,
                layout: { "line-cap": "round", "line-join": "round" },
                paint,
              },
              beforeId,
            );
          };
          // Travelled (past) portion greyed + dashed; upcoming portion mustard.
          const splitIdx = journey.findIndex((s) => s.timeframe !== "previous");
          const traveled =
            splitIdx === -1 ? journey : journey.slice(0, splitIdx + 1);
          const planned = splitIdx === -1 ? [] : journey.slice(splitIdx);
          addRoute("itinerary-traveled", traveled, {
            "line-color": PAST_GREY,
            "line-width": 4,
            "line-dasharray": [2, 2],
          });
          addRoute("itinerary-route", planned, {
            "line-color": BRAND.mustard,
            "line-width": 6,
          });
        }

        const bounds = boundsOf(
          journey.map((s) => [s.longitude, s.latitude] as [number, number]),
        );
        if (bounds) {
          theMap.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
        }
        applyZoomVisibility();
      });
    })().catch(() => {
      // swallow: the panel below still lists the journey
    });

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      markers = [];
      map?.remove();
    };
  }, [journey]);

  return (
    <div
      ref={containerRef}
      className="h-[440px] w-full overflow-hidden rounded-2xl border border-border"
    />
  );
}
