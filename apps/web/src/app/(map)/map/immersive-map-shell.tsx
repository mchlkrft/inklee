"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  MapPin,
  Minus,
  Moon,
  Plus,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import RandomizedLogo from "@/components/randomized-logo";
import SidebarItem from "@/components/app-shell/sidebar-item";
import MobileBottomNav from "@/components/app-shell/mobile-bottom-nav";
import { SIDEBAR_NAV, isItemActive } from "@/components/app-shell/nav-config";
import {
  MAP_LOCATION_CATEGORIES,
  MAP_LOCATION_CATEGORY_LABELS,
  type PublicArtistCity,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import type { MapScheme } from "@inklee/shared/map-style";
import type { TravelMapStop } from "@inklee/shared/travel-map";
import {
  STUDIO_SIGNAL_LABELS,
  isStudioSignalType,
} from "@inklee/shared/studio-signals";
import {
  DEFAULT_MAP_URL_STATE,
  decodeMapUrlState,
  encodeMapUrlState,
  type MapCapabilities,
  type MapFilterKind,
  type MapViewport,
} from "@inklee/shared/map-core-state";
import { publicMapEnabled } from "@/lib/map-features";
import { trackPublicEvent } from "@/lib/public-analytics/collector";
import {
  STUDIO_DATA_CREDIT,
  DATA_ATTRIBUTION_PATH,
  DATA_ATTRIBUTION_LINK_LABEL,
} from "@inklee/shared/map-attribution";
import { toggleWatchAction } from "./actions";
import MapSearchBox from "./map-search-box";
import MapCanvas, {
  type MapCanvasHandle,
  type MapCanvasStats,
} from "./core/map-canvas";
import MapDetailPanel from "./map-detail-panel";

// The logged-in immersive shell: the shared map core (MapCanvas) is the
// background, framed by the charcoal shell gutter. The logo sits in its own
// pill with the search, a filter menu and My trips beside it; the platform's
// pill nav floats as a compact full-height rail (the real SidebarItem, so
// future menu changes carry over); the zoom control and a dark/light toggle
// float top right. Capability layer over the core (the SAME MapCanvas backs the
// public shell later). Rendered whenever tattooMapEnabled() (the boxed
// discovery fallback was retired 2026-07-25).

const RAIL_ITEMS = SIDEBAR_NAV.flatMap((group) => group.items);

export default function ImmersiveMapShell({
  journey,
  watchedIds,
  capabilities,
}: {
  journey: TravelMapStop[];
  watchedIds: string[];
  capabilities: MapCapabilities;
}) {
  const pathname = usePathname();
  const canvasRef = useRef<MapCanvasHandle>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Read the initial map state from the URL once (guarded for SSR). The camera
  // captured here is handed to the canvas; later moves flow back via
  // onViewChange and are written to the URL.
  const [initialState] = useState(() =>
    typeof window !== "undefined"
      ? decodeMapUrlState(window.location.search)
      : DEFAULT_MAP_URL_STATE,
  );
  const viewportRef = useRef<MapViewport>(initialState.viewport);

  const [scheme, setScheme] = useState<MapScheme>("light");
  // Camera handed to the canvas at (re)mount. Updated only when the scheme
  // toggles (in the handler, never during render), so a theme switch preserves
  // the current camera without reading a ref during render.
  const [mountViewport, setMountViewport] = useState(initialState.viewport);
  const [filter, setFilter] = useState<MapFilterKind>(initialState.filter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<PublicMapPin | null>(null);
  const [selectedCity, setSelectedCity] = useState<PublicArtistCity | null>(
    null,
  );
  const [showJourney, setShowJourney] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(
    () => new Set(watchedIds),
  );
  const [watchError, setWatchError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [artistCities, setArtistCities] = useState<PublicArtistCity[]>([]);
  const [stats, setStats] = useState<MapCanvasStats>({
    visibleCount: 0,
    total: 0,
    capped: false,
  });
  const [railExpanded, setRailExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [attributionOpen, setAttributionOpen] = useState(false);
  const [inViewPins, setInViewPins] = useState<PublicMapPin[]>([]);
  const [expandedPin, setExpandedPin] = useState<PublicMapPin | null>(null);
  const [pinsFailed, setPinsFailed] = useState(false);

  const showOverlays = capabilities.canSeePersonalOverlays;
  // The anonymous plane (go-live plan S2): same shell, public capability
  // layer. No rail or bottom nav (the artist chrome), no artists layer (D2),
  // sign-in walls instead of gated actions, and the experimental banner.
  const isPublic = capabilities.isPublic;

  // Sign-in wall for the header: captures the CURRENT map state (it lives in
  // the URL) at click time, so signing in returns the visitor to the exact
  // viewport. Panel CTAs use static per-target hrefs instead.
  const signInHere = useCallback(() => {
    trackPublicEvent("map_signup_cta_clicked", {
      surface: "map_shell",
      intent: "sign_in",
    });
    const next = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.assign(`/login?next=${next}`);
  }, []);

  const filterOptions = useMemo<{ key: MapFilterKind; label: string }[]>(
    () => [
      { key: "all", label: "Everything" },
      ...MAP_LOCATION_CATEGORIES.map((c) => ({
        key: c,
        label: MAP_LOCATION_CATEGORY_LABELS[c],
      })),
      ...(showOverlays
        ? [{ key: "watched" as MapFilterKind, label: "Watched" }]
        : []),
      { key: "signals", label: "Signals" },
    ],
    [showOverlays],
  );

  // Lock background scroll while the takeover is mounted.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // The My trips control renders md+ only; when the viewport drops below md
  // (tablet rotation, window resize) the journey overlay must not stay stuck on
  // with its only toggle hidden, so the overlay follows the same breakpoint.
  const [mdUp, setMdUp] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setMdUp(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Close the filter menu on an outside click.
  useEffect(() => {
    if (!filterOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [filterOpen]);

  // Artists in town: one consent-gated, floored, city-level fetch (shared by
  // the canvas badges and the city panel). NEVER on the public plane: founder
  // decision D2 postpones the artists layer entirely there (the route would
  // refuse the anonymous request anyway; not fetching keeps the plane clean).
  useEffect(() => {
    if (isPublic) return;
    const abort = new AbortController();
    fetch("/api/map/artists", { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { cities: PublicArtistCity[] } | null) => {
        if (body) setArtistCities(body.cities);
      })
      .catch(() => {
        // Offline or aborted: the map works without the artist layer.
      });
    return () => abort.abort();
  }, [isPublic]);

  // --- URL state (one model) -------------------------------------------------
  const writeUrl = useCallback(
    (
      next: {
        viewport?: MapViewport;
        filter?: MapFilterKind;
        selectedId?: string | null;
      },
      push: boolean,
    ) => {
      if (typeof window === "undefined") return;
      const qs = encodeMapUrlState({
        viewport: next.viewport ?? viewportRef.current,
        filter: next.filter ?? filter,
        selectedId:
          next.selectedId !== undefined
            ? next.selectedId
            : (selected?.id ?? null),
      });
      const url = qs ? `?${qs}` : window.location.pathname;
      if (push) window.history.pushState(window.history.state, "", url);
      else window.history.replaceState(window.history.state, "", url);
    },
    [filter, selected],
  );

  const handleViewChange = useCallback(
    (view: MapViewport) => {
      viewportRef.current = view;
      writeUrl({ viewport: view }, false);
    },
    [writeUrl],
  );

  // Back button: close the selection (its open pushed a history entry) and
  // restore the filter + camera the URL now describes.
  useEffect(() => {
    const onPop = () => {
      const s = decodeMapUrlState(window.location.search);
      setFilter(s.filter);
      viewportRef.current = s.viewport;
      canvasRef.current?.flyTo(s.viewport.lng, s.viewport.lat, s.viewport.zoom);
      if (!s.selectedId) {
        setSelected(null);
        setSelectedCity(null);
        setExpandedPin(null);
        setWatchError(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const selectPin = useCallback(
    (pin: PublicMapPin) => {
      setSelectedCity(null);
      setWatchError(null);
      setExpandedPin(null);
      setSelected(pin);
      // Coarse by construction: the surface, never which studio.
      trackPublicEvent("map_studio_opened", { surface: "panel" });
      writeUrl({ selectedId: pin.id }, true);
    },
    [writeUrl],
  );

  const closeDetail = useCallback(() => {
    setSelected(null);
    setSelectedCity(null);
    setExpandedPin(null);
    setWatchError(null);
    writeUrl({ selectedId: null }, false);
  }, [writeUrl]);

  const changeFilter = useCallback(
    (next: MapFilterKind) => {
      setFilter(next);
      // Filter TYPE only, never its value: the collector's allowlist forbids
      // free text, and which category someone browsed is not a growth
      // dimension worth carrying.
      if (next !== "all") {
        trackPublicEvent("map_filter_applied", {
          filter_type: next === "signals" ? "signals" : "category",
        });
      }
      writeUrl({ filter: next }, false);
    },
    [writeUrl],
  );

  const handleSearchSelect = useCallback(
    (pin: PublicMapPin) => {
      if (filter !== "all") changeFilter("all");
      selectPin(pin);
      canvasRef.current?.flyTo(pin.lng, pin.lat, 14);
    },
    [filter, changeFilter, selectPin],
  );

  // Picking a studio from the list takes you to the map, focused on it (the
  // list is the keyboard/screen-reader path to the canvas-only markers).
  const selectFromList = useCallback(
    (pin: PublicMapPin) => {
      setViewMode("map");
      selectPin(pin);
      canvasRef.current?.flyTo(pin.lng, pin.lat, 14);
    },
    [selectPin],
  );

  // ESC closes the open panel (the panel is non-modal, so a document listener
  // is the reliable path — pins are canvas features, not focusable DOM).
  useEffect(() => {
    // When the expanded detail is open it owns Escape (closes only itself).
    if ((!selected && !selectedCity) || expandedPin) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected, selectedCity, expandedPin, closeDetail]);

  // Move focus into the panel when it opens (screen-reader + keyboard path).
  useEffect(() => {
    if (selected || selectedCity) drawerRef.current?.focus();
  }, [selected, selectedCity]);

  const toggleWatch = (pin: PublicMapPin) => {
    setWatchError(null);
    startTransition(async () => {
      const result = await toggleWatchAction(pin.id);
      if (result.error) {
        setWatchError(result.error);
        return;
      }
      setWatched((prev) => {
        const next = new Set(prev);
        if (result.watched) next.add(pin.id);
        else next.delete(pin.id);
        return next;
      });
    });
  };

  const statsText = useMemo(() => {
    if (stats.capped && filter === "all") {
      return `${stats.visibleCount} of ${stats.total} places in view, zoom in for the rest`;
    }
    const base = `${stats.visibleCount} ${stats.visibleCount === 1 ? "place" : "places"} in view`;
    if (filter === "watched" && stats.visibleCount === 0) {
      return `${base} · watch studios from their pins to collect them here`;
    }
    return base;
  }, [stats, filter]);

  const activeFilterLabel =
    filter === "all"
      ? "Filter"
      : (filterOptions.find((o) => o.key === filter)?.label ?? "Filter");

  return (
    // The map is the background, framed by the charcoal shell (the p-3 gutter).
    // The scheme drives both the basemap and the semantic tokens, so dark/light
    // is one switch and the whole surface is native-ready.
    <div
      className={`fixed inset-0 z-[60] bg-[color:var(--color-shell-bg)] p-3 text-brand-bone md:pb-3 ${
        isPublic
          ? "pb-[calc(env(safe-area-inset-bottom,0px)_+_0.75rem)]"
          : "pb-[calc(env(safe-area-inset-bottom,0px)_+_2.75rem)]"
      } ${scheme === "dark" ? "dark" : ""}`}
      data-appearance={scheme === "light" ? "light" : undefined}
    >
      <div className="map-immersive relative h-full w-full overflow-hidden rounded-[24px] border border-[color:var(--color-shell-hover-strong)]">
        {/* Remounts on scheme change so the basemap re-inits; the current camera
            is preserved via mountViewport. */}
        <MapCanvas
          key={scheme}
          ref={canvasRef}
          scheme={scheme}
          initialView={mountViewport}
          filter={filter}
          watched={watched}
          journey={journey}
          showJourney={showJourney && mdUp}
          artistCities={artistCities}
          onSelectPin={selectPin}
          onSelectCity={(city) => {
            setSelected(null);
            setSelectedCity(city);
            setWatchError(null);
          }}
          onViewChange={handleViewChange}
          onStats={setStats}
          onPins={setInViewPins}
          publicPlane={isPublic}
          onPinsError={setPinsFailed}
        />

        {/* Failed viewport load: keep the last pins on screen but say so and
            offer a retry (the silently empty map was the historical failure
            mode; go-live plan S2). */}
        {pinsFailed ? (
          <div className="absolute left-1/2 top-[64px] z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 py-1 pl-3.5 pr-1 text-xs text-foreground shadow-lg backdrop-blur">
            <span>Map data did not load.</span>
            <button
              type="button"
              onClick={() => canvasRef.current?.refetchPins()}
              className="rounded-full bg-foreground px-3 py-1.5 text-xs text-background transition-opacity hover:opacity-90"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Public plane: the experimental framing, always visible (Q3
            decision: an experimental surface evolving with the community). */}
        {isPublic && !pinsFailed ? (
          <p className="pointer-events-none absolute left-1/2 top-[64px] z-20 max-w-[calc(100vw-5rem)] -translate-x-1/2 truncate rounded-full bg-background/85 px-3.5 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
            An experimental map. It grows and improves with the community.
          </p>
        ) : null}

        {/* List view: the accessible alternative to canvas markers. Shares the
            map's filtered in-view pins (one dataset, one filter). On phones it
            spans the full width above the bottom nav; from md it docks beside
            the rail. */}
        {viewMode === "list" ? (
          <div
            className={`absolute bottom-[4.5rem] left-3 right-3 top-[64px] z-20 touch-pan-y overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur transition-[left] duration-200 md:bottom-3 md:right-auto md:w-[340px] ${
              isPublic
                ? "md:left-3"
                : railExpanded
                  ? "md:left-[232px]"
                  : "md:left-[88px]"
            }`}
          >
            <p className="mb-2 px-1 text-xs text-muted-foreground">
              {inViewPins.length} {inViewPins.length === 1 ? "place" : "places"}{" "}
              in view
            </p>
            {inViewPins.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">
                No places in view. Zoom out or pan the map, then open the list
                again.
              </p>
            ) : (
              <ul role="list" className="space-y-1.5">
                {inViewPins.map((pin) => (
                  <li key={pin.id}>
                    <button
                      type="button"
                      onClick={() => selectFromList(pin)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {pin.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {MAP_LOCATION_CATEGORY_LABELS[pin.category]}
                          {pin.city ? ` · ${pin.city}` : ""}
                          {pin.country ? ` · ${pin.country}` : ""}
                        </p>
                      </div>
                      {pin.signal && isStudioSignalType(pin.signal) ? (
                        <span className="shrink-0 rounded-full bg-brand-rosa/20 px-2 py-0.5 text-xs text-brand-rosa">
                          {STUDIO_SIGNAL_LABELS[pin.signal]}
                        </span>
                      ) : null}
                      {pin.claimed ? (
                        <span className="shrink-0 rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
                          Claimed
                        </span>
                      ) : null}
                      {watched.has(pin.id) ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          Watching
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {/* Top-left: logo pill, search, filter menu, My trips — one row. On
            phones the row is bounded on the right (clear of the theme toggle)
            and the search takes the remaining width; My trips is md+. */}
        <div className="absolute left-3 right-[4.25rem] top-3 z-40 flex items-center gap-2 md:right-auto">
          <div
            className={`flex h-11 items-center rounded-full border border-border px-4 shadow-lg backdrop-blur ${
              scheme === "light"
                ? "bg-[color:var(--color-shell-bg)]"
                : "bg-background/95"
            }`}
          >
            <Link
              href={isPublic ? "/" : "/dashboard"}
              aria-label={
                isPublic ? "Go to the inklee homepage" : "Go to your dashboard"
              }
              className="inline-flex items-center"
            >
              <RandomizedLogo
                height={18}
                color={scheme === "light" ? "mustard" : undefined}
              />
            </Link>
          </div>

          <MapSearchBox
            onSelect={handleSearchSelect}
            shape="pill"
            // Phones: the search flexes into whatever the bounded row leaves
            // (the old calc(100vw-30rem) collapsed to zero below ~480px).
            // md+: the fixed pill width, clamped so it never crowds the row.
            containerClassName="relative min-w-0 flex-1 md:flex-none md:w-[min(18rem,calc(100vw-30rem))]"
          />

          {/* Filter menu (all filter options in one pill). */}
          <div ref={filterRef} className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={filterOpen}
              aria-label={
                filter === "all"
                  ? "Filter places"
                  : `Filter: ${activeFilterLabel}`
              }
              title={filter === "all" ? "Filter places" : activeFilterLabel}
              className={`flex h-11 w-11 items-center justify-center rounded-full border shadow-lg backdrop-blur transition-colors ${
                filter !== "all"
                  ? "border-transparent bg-foreground text-background"
                  : "border-border bg-background/95 text-muted-foreground hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
            </button>
            {filterOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-[52px] z-10 min-w-44 rounded-2xl border border-border bg-background/98 p-1 shadow-lg backdrop-blur md:left-0 md:right-auto"
              >
                {filterOptions.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={filter === o.key}
                    onClick={() => {
                      changeFilter(o.key);
                      setFilterOpen(false);
                    }}
                    className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors lg:py-1.5 ${
                      filter === o.key
                        ? "bg-muted/40 text-foreground"
                        : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* My trips: a first-class button for the artist's own journey.
              md+ only; on phones the journey stays reachable via /travel. */}
          {showOverlays && journey.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowJourney((v) => !v)}
              aria-pressed={showJourney}
              className={`hidden h-11 items-center gap-1.5 rounded-full border px-4 text-sm shadow-lg backdrop-blur transition-colors md:flex ${
                showJourney
                  ? "border-transparent bg-foreground text-background"
                  : "border-border bg-background/95 text-foreground hover:bg-muted/30"
              }`}
            >
              <MapPin className="h-4 w-4 shrink-0" aria-hidden />
              My trips
            </button>
          ) : null}
        </div>

        {/* Top-right: zoom pill (md+; pinch covers zoom on touch), then the
            dark/light toggle (44px touch target on phones). On the public
            plane a sign-in row leads the stack: the conversion actions live in
            the panels; this is the persistent way in. */}
        <div className="absolute right-3 top-3 z-30 flex flex-col items-end gap-2">
          {isPublic ? (
            <div className="hidden items-center gap-2 md:flex">
              <button
                type="button"
                onClick={signInHere}
                className="flex h-9 items-center rounded-full border border-border bg-background/95 px-4 text-xs text-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted/30"
              >
                Sign in
              </button>
              <Link
                href="/signup"
                onClick={() =>
                  trackPublicEvent("map_signup_cta_clicked", {
                    surface: "map_shell",
                    intent: "create_account",
                  })
                }
                className="flex h-9 items-center rounded-full bg-foreground px-4 text-xs text-background shadow-lg transition-opacity hover:opacity-90"
              >
                Create account
              </Link>
            </div>
          ) : null}
          <div className="hidden flex-col overflow-hidden rounded-full border border-border bg-background/95 shadow-lg backdrop-blur md:flex">
            <button
              type="button"
              onClick={() => canvasRef.current?.zoomIn()}
              aria-label="Zoom in"
              className="flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)]"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
            <span aria-hidden className="h-px w-full bg-border" />
            <button
              type="button"
              onClick={() => canvasRef.current?.zoomOut()}
              aria-label="Zoom out"
              className="flex h-9 w-9 items-center justify-center text-foreground transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)]"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              // Preserve the current camera across the canvas remount.
              setMountViewport(viewportRef.current);
              setScheme((s) => (s === "dark" ? "light" : "dark"));
            }}
            aria-label={
              scheme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] md:h-9 md:w-9"
          >
            {scheme === "dark" ? (
              <Sun className="h-4 w-4 text-brand-mustard" aria-hidden />
            ) : (
              <Moon className="h-4 w-4 fill-brand-charcoal" aria-hidden />
            )}
          </button>
        </div>

        {/* Public phones: a bottom conversion bar where the app's bottom nav
            would sit (the panels stack above it like a bottom sheet). */}
        {isPublic ? (
          <div className="absolute inset-x-3 bottom-3 z-30 flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={signInHere}
              className="flex h-11 flex-1 items-center justify-center rounded-full border border-border bg-background/95 px-4 text-sm text-foreground shadow-lg backdrop-blur transition-colors hover:bg-muted/30"
            >
              Sign in
            </button>
            <Link
              href="/signup"
              className="flex h-11 flex-1 items-center justify-center rounded-full bg-foreground px-4 text-sm text-background shadow-lg transition-opacity hover:opacity-90"
            >
              Create account
            </Link>
          </div>
        ) : null}

        {/* Left: the platform nav (real SidebarItem), collapsed + full-height +
            floating, so it stays in lockstep with the rest of the menu. The
            anonymous plane gets no artist chrome (S2): no rail, no bottom
            nav; its ways in are the logo, the sign-in row and the panel CTAs. */}
        {isPublic ? null : (
          <nav
            aria-label="Primary"
            className={`absolute bottom-3 left-3 top-[64px] z-30 hidden flex-col rounded-[22px] border border-[color:var(--color-shell-hover-strong)] bg-[color:var(--color-shell-bg)] text-brand-bone shadow-lg transition-[width] duration-200 md:flex ${
              railExpanded ? "w-52" : "w-16"
            }`}
          >
            <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {RAIL_ITEMS.map((item) => (
                <SidebarItem
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  Icon={item.icon}
                  active={isItemActive(pathname, item)}
                  collapsed={!railExpanded}
                />
              ))}
            </div>
            <div className="p-2">
              <button
                type="button"
                onClick={() => setRailExpanded((v) => !v)}
                aria-label={
                  railExpanded ? "Collapse navigation" : "Expand navigation"
                }
                aria-expanded={railExpanded}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[color:var(--color-shell-fg-mute)] transition-colors hover:bg-[color:var(--color-shell-hover-strong)] hover:text-brand-bone"
              >
                {railExpanded ? (
                  <ChevronLeft
                    className="h-[18px] w-[18px] shrink-0"
                    aria-hidden
                  />
                ) : (
                  <ChevronRight
                    className="h-[18px] w-[18px] shrink-0"
                    aria-hidden
                  />
                )}
                {railExpanded ? <span>Collapse</span> : null}
              </button>
            </div>
          </nav>
        )}

        {/* Bottom row, one height: in-view count (left, clear of the rail),
            the map/list toggle (center), the MapLibre attribution (right). */}
        {viewMode === "map" && !selected && !selectedCity ? (
          <p
            className={`pointer-events-none absolute bottom-3 z-20 hidden h-[30px] max-w-[42vw] truncate rounded-full bg-background/85 px-3.5 text-xs leading-[30px] text-muted-foreground shadow-sm backdrop-blur transition-[left] duration-200 md:block ${
              isPublic
                ? "left-3"
                : railExpanded
                  ? "left-[232px]"
                  : "left-[88px]"
            }`}
          >
            {statsText}
          </p>
        ) : null}
        {/* Map/List toggle: on phones it floats above the bottom nav (clear of
            the raised center FAB); from md it sits on the bottom-3 baseline. */}
        <div className="absolute bottom-[4.75rem] left-1/2 z-30 flex -translate-x-1/2 items-center rounded-full border border-border bg-background/95 p-0.5 shadow-lg backdrop-blur md:bottom-3">
          {(["map", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              aria-pressed={viewMode === m}
              className={`rounded-full px-4 py-2 text-xs transition-colors md:px-3 md:py-1 ${
                viewMode === m
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "map" ? "Map" : "List"}
            </button>
          ))}
        </div>

        {/* Attribution as a custom pill, so it matches the height + baseline of
            the count and the toggle (bottom-3, 30px). Public phones: lifted
            clear of the bottom conversion bar so the compliance surface never
            loses tap target to it. */}
        <div
          className={`pointer-events-auto absolute right-3 z-20 flex items-center md:bottom-3 ${
            isPublic ? "bottom-[4.75rem]" : "bottom-10"
          } ${scheme === "dark" ? "text-brand-rosa" : "text-muted-foreground"}`}
        >
          {/* Phones: a collapsed round "i" pill; tapping unfolds the links
              (the wide pill wrapped and sat off-center at phone widths). */}
          {attributionOpen ? (
            <div className="mr-2 flex h-10 max-w-[calc(100vw_-_7.5rem)] items-center gap-2 overflow-hidden rounded-full bg-background/85 px-3.5 text-[11px] shadow-sm backdrop-blur md:hidden">
              <AttributionLinks />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setAttributionOpen((v) => !v)}
            aria-expanded={attributionOpen}
            aria-label="Map attribution"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-background/85 shadow-sm backdrop-blur transition-colors hover:text-foreground md:hidden"
          >
            <Info className="h-4 w-4" aria-hidden />
          </button>
          {/* md+: the flat pill, unchanged. */}
          <div className="hidden h-[30px] max-w-[60vw] items-center gap-2 overflow-hidden rounded-full bg-background/85 px-3.5 text-[11px] shadow-sm backdrop-blur md:flex">
            <AttributionLinks />
          </div>
        </div>

        {/* Selected city panel (bottom sheet on mobile, bottom-right card on
            desktop; kept clear of the top-right zoom control). */}
        {selectedCity ? (
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="false"
            aria-label={`Artists in ${selectedCity.cityLabel}`}
            tabIndex={-1}
            className="absolute inset-x-3 bottom-10 z-40 max-w-sm space-y-2 rounded-2xl border border-border bg-background/95 p-3 shadow-lg outline-none backdrop-blur md:bottom-3 lg:left-auto lg:right-3 lg:z-20 lg:w-80"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selectedCity.cityLabel}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selectedCity.count}{" "}
                  {selectedCity.count === 1 ? "artist" : "artists"} in town
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                aria-label="Close"
                className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {/* Named artists only where the capability allows it (defense in
                depth: the public plane never receives cities at all, D2). */}
            {capabilities.canSeeNamedArtists &&
            selectedCity.artists.length > 0 ? (
              <ul className="max-h-44 space-y-1 overflow-y-auto overscroll-contain">
                {selectedCity.artists.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/${a.slug}`}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm text-foreground hover:bg-muted/30 lg:py-1"
                    >
                      <span className="truncate">{a.displayName}</span>
                      {a.lookingForGuestSpots ? (
                        <span className="shrink-0 rounded-full bg-brand-mustard/20 px-2 py-0.5 text-xs text-brand-mustard">
                          Looking for guest spots
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Everyone here is counted anonymously.
              </p>
            )}
          </div>
        ) : null}

        {/* Selected studio panel (compact preview; hidden once expanded). */}
        {selected && !expandedPin ? (
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="false"
            aria-label={selected.name}
            tabIndex={-1}
            className="absolute inset-x-3 bottom-10 z-40 max-w-sm space-y-2 rounded-2xl border border-border bg-background/95 p-3 shadow-lg outline-none backdrop-blur md:bottom-3 lg:left-auto lg:right-3 lg:z-20 lg:w-80"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {selected.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {MAP_LOCATION_CATEGORY_LABELS[selected.category]}
                  {selected.city ? ` · ${selected.city}` : ""}
                  {selected.claimed ? " · claimed" : ""}
                </p>
                {selected.signal && isStudioSignalType(selected.signal) ? (
                  <p className="mt-1 inline-block rounded-full bg-brand-rosa/20 px-2 py-0.5 text-xs text-brand-rosa">
                    {STUDIO_SIGNAL_LABELS[selected.signal]}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                aria-label="Close"
                className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {watchError ? (
              <p className="text-xs text-brand-red">{watchError}</p>
            ) : null}
            <div className="flex items-center gap-2">
              {capabilities.canWatch ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => toggleWatch(selected)}
                  className="rounded-md border border-border px-3 py-2.5 text-xs text-foreground transition-colors hover:bg-muted/30 disabled:opacity-50 lg:py-1.5"
                >
                  {watched.has(selected.id) ? "Watching ✓" : "Watch"}
                </button>
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(`/map/${selected.id}`)}`}
                  onClick={() =>
                    trackPublicEvent("map_signup_cta_clicked", {
                      surface: "map_detail",
                      intent: "watch",
                    })
                  }
                  className="rounded-md border border-border px-3 py-2.5 text-xs text-foreground transition-colors hover:bg-muted/30 lg:py-1.5"
                >
                  Sign in to watch
                </Link>
              )}
              <button
                type="button"
                onClick={() => setExpandedPin(selected)}
                className="rounded-md bg-foreground px-3 py-2.5 text-xs text-background transition-opacity hover:opacity-90 lg:py-1.5"
              >
                View details
              </button>
            </div>
          </div>
        ) : null}

        {/* Expanded in-canvas detail (fetched on demand). */}
        {expandedPin ? (
          <MapDetailPanel
            key={expandedPin.id}
            pin={expandedPin}
            capabilities={capabilities}
            watched={watched.has(expandedPin.id)}
            onToggleWatch={() => toggleWatch(expandedPin)}
            watchError={watchError}
            watchPending={pending}
            onClose={() => setExpandedPin(null)}
          />
        ) : null}
      </div>

      {/* Phones: the shell overlay (z-60) covers the app layout's bottom nav,
          which would leave the map a navigation dead end with the rail hidden.
          Re-render the same nav inside the overlay (it is fixed + md:hidden +
          safe-area aware, so it lands exactly where it does on every other
          screen). Open panels stack above it (z-40) like a bottom sheet.
          Never on the public plane: the artist chrome is authed-only; public
          phones get the conversion bar inside the frame instead. */}
      {isPublic ? null : <MobileBottomNav inMapShell />}
    </div>
  );
}

// The license links, shared by the desktop pill and the phone unfold. The
// basemap credits are always due; the STUDIO-DATA credit joins them with the
// public flip, rendered per the counsel-approved module contract: the
// STUDIO_DATA_CREDIT string verbatim, followed by the "Licences and notices"
// link to /data-attribution (all three imported from
// @inklee/shared/map-attribution, never restated).
function AttributionLinks() {
  return (
    <>
      <a
        href="https://maplibre.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 transition-colors hover:text-foreground"
      >
        MapLibre
      </a>
      <a
        href="https://carto.com/attributions"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 transition-colors hover:text-foreground"
      >
        © CARTO
      </a>
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
        className="truncate transition-colors hover:text-foreground"
      >
        © OpenStreetMap contributors
      </a>
      {publicMapEnabled() ? (
        <>
          <span className="truncate" title={STUDIO_DATA_CREDIT}>
            {STUDIO_DATA_CREDIT}
          </span>
          <Link
            href={DATA_ATTRIBUTION_PATH}
            className="shrink-0 transition-colors hover:text-foreground"
          >
            {DATA_ATTRIBUTION_LINK_LABEL}
          </Link>
        </>
      ) : null}
    </>
  );
}
