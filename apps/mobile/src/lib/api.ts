import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type QueryClient,
} from "@tanstack/react-query";
import { config } from "./config";
import { supabase } from "./supabase";

// Thin client for the Bearer-JWT JSON API at <web>/api/mobile/*. Mirrors the
// server envelope: success -> { data }, failure -> { error: { code, message } }.
const BASE = config.apiUrl;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}/api/mobile${path}`, {
    headers: { ...(await authHeader()) },
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.code ?? "error",
    );
  }
  return json.data as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/mobile${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.code ?? "error",
    );
  }
  return json.data as T;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/mobile${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.code ?? "error",
    );
  }
  return json.data as T;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/mobile${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.code ?? "error",
    );
  }
  return json.data as T;
}

// Multipart upload (image picker → /api/mobile/.../image). No explicit
// Content-Type so fetch sets the multipart boundary; the RN file descriptor
// ({uri,name,type}) is what FormData expects on native.
export async function apiUpload<T>(
  path: string,
  file: { uri: string; name: string; type: string },
): Promise<T> {
  const form = new FormData();
  form.append("image", {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
  const res = await fetch(`${BASE}/api/mobile${path}`, {
    method: "POST",
    headers: { ...(await authHeader()) },
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      json?.error?.message ?? `Upload failed (${res.status})`,
      res.status,
      json?.error?.code ?? "error",
    );
  }
  return json.data as T;
}

export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/mobile${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      json?.error?.message ?? `Request failed (${res.status})`,
      res.status,
      json?.error?.code ?? "error",
    );
  }
  return json.data as T;
}

type ApiQuery<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * Data-fetching hook for GET endpoints, backed by TanStack Query: caching,
 * dedup, background revalidation, request cancellation (the `signal` aborts a
 * stale in-flight fetch on unmount / key change), and cross-screen invalidation
 * (see `invalidateBookingViews`). The return shape is kept identical to the old
 * hand-rolled hook so screens are unchanged.
 *
 * queryKey = ["api", path]; the path carries any query params (e.g.
 * /calendar?from=…), so it's a stable per-resource key, and a path change
 * (calendar month nav) switches to that key's own cache rather than flashing
 * the previous resource's data.
 */
export function useApiQuery<T>(
  path: string,
  opts?: { keepPrevious?: boolean; enabled?: boolean },
): ApiQuery<T> {
  const q = useQuery({
    queryKey: ["api", path],
    queryFn: ({ signal }) => apiGet<T>(path, signal),
    // For dynamic-path screens that switch a filter (e.g. Insights' range), keep
    // the previous result visible during the swap instead of blanking to a
    // spinner. Off by default (calendar deliberately drops stale cross-month data).
    placeholderData: opts?.keepPrevious ? keepPreviousData : undefined,
    // Gate the fetch on a precondition (e.g. /me only once a session exists).
    // undefined → enabled (the default for every other screen).
    enabled: opts?.enabled,
  });
  return {
    data: q.data ?? null,
    error: q.isError
      ? q.error instanceof Error
        ? q.error.message
        : "Something went wrong."
      : null,
    // A disabled query (enabled:false) reports status "pending" in v5; gate on
    // fetchStatus so it never reports loading:true — otherwise a screen that
    // renders a spinner off `loading` would spin forever while the query is off.
    loading: q.isLoading && q.fetchStatus !== "idle",
    // Background refetch (pull-to-refresh / invalidation) while data is present.
    refreshing: q.isFetching && !q.isLoading,
    refresh: () => {
      void q.refetch();
    },
  };
}

type InfinitePage<T> = { items: T[]; nextCursor: string | null };

/**
 * Keyset-paginated GET hook for `{ items, nextCursor }` endpoints (the booking
 * inbox). Same `["api", path]` key as useApiQuery — so a `?status=` swap is its
 * own cache, and `invalidateBookingViews` (startsWith "/bookings") refreshes it
 * after a mutation. The cursor rides as a page param, not in the key, so pages
 * accumulate. Wire `fetchNextPage` to FlatList `onEndReached`.
 */
export function useInfiniteApiQuery<T>(path: string) {
  const q = useInfiniteQuery({
    queryKey: ["api", path],
    queryFn: ({ pageParam, signal }) => {
      const sep = path.includes("?") ? "&" : "?";
      const url =
        pageParam != null
          ? `${path}${sep}cursor=${encodeURIComponent(pageParam)}`
          : path;
      return apiGet<InfinitePage<T>>(url, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  return {
    items: q.data?.pages.flatMap((p) => p.items) ?? [],
    error: q.isError
      ? q.error instanceof Error
        ? q.error.message
        : "Something went wrong."
      : null,
    loading: q.isLoading,
    refreshing: q.isRefetching,
    fetchingNextPage: q.isFetchingNextPage,
    refresh: () => {
      void q.refetch();
    },
    fetchNextPage: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
    },
  };
}

/**
 * Invalidate every cached `["api", path]` query whose path starts with one of
 * the given prefixes — the one predicate body behind all the cross-screen
 * invalidation helpers (here and in the domain libs), so new helpers can't
 * drift in shape.
 */
export function invalidateByPathPrefix(
  client: QueryClient,
  prefixes: readonly string[],
): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => {
      const path = query.queryKey[1];
      return (
        typeof path === "string" && prefixes.some((p) => path.startsWith(p))
      );
    },
  });
}

// Every cached view a booking mutation can affect. One action (accept / deposit
// / refund / cancel) invalidates the detail AND the inbox, Home counts, calendar
// and client history together — the cross-screen freshness the old per-screen
// refetch couldn't provide.
const BOOKING_VIEW_PREFIXES = ["/bookings", "/home", "/calendar", "/clients"];

export function invalidateBookingViews(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, BOOKING_VIEW_PREFIXES);
}

// Every view that reflects the books open/closed state. A toggle (quick sheet
// or settings form) invalidates the top-bar pill (/me), the Home aggregate, the
// settings form, and the booking-form preview together.
const BOOKS_VIEW_PREFIXES = ["/settings/books", "/home", "/me", "/booking-form"];

export function invalidateBooksViews(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, BOOKS_VIEW_PREFIXES);
}

// Every view that reflects the slot inventory: the slots list itself plus the
// two openSlotCount / isFixedSlotsWithoutSlots consumers (the booking-form
// warning banner and the books screen's mode section).
const SLOTS_VIEW_PREFIXES = ["/slots", "/booking-form", "/settings/books"];

export function invalidateSlots(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, SLOTS_VIEW_PREFIXES);
}

// Identity / onboarding-scoped views. `invalidateBookingViews` covers /home but
// not /me — completing onboarding invalidates these so the root navigator's /me
// gate re-reads `onboardingCompleted` and swaps the onboarding stack for the
// tabs (the same elegant pattern as the session gate).
const IDENTITY_VIEW_PREFIXES = ["/me", "/home", "/settings/profile"];

export function invalidateIdentity(client: QueryClient): Promise<void> {
  return invalidateByPathPrefix(client, IDENTITY_VIEW_PREFIXES);
}
