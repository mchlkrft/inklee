import { useCallback, useEffect, useState } from "react";
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

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api/mobile${path}`, {
    headers: { ...(await authHeader()) },
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

type ApiQuery<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
};

/** Minimal data-fetching hook (load + pull-to-refresh) for GET endpoints. */
export function useApiQuery<T>(path: string): ApiQuery<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(
    async (isRefresh: boolean) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      // A non-refresh load means a fresh mount or a path change (e.g. the
      // calendar moving to a new month). Drop stale data so a dynamic-path
      // consumer never renders the previous resource's data for a beat.
      // Pull-to-refresh keeps the current data visible underneath.
      if (!isRefresh) setData(null);
      try {
        setData(await apiGet<T>(path));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [path],
  );

  useEffect(() => {
    run(false);
  }, [run]);

  return { data, error, loading, refreshing, refresh: () => run(true) };
}
