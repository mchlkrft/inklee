"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import {
  fetchNotificationsAction,
  markReadAction,
  markAllReadAction,
  resolveWarningAction,
} from "@/app/(artist)/notifications/actions";
import type { Notification, NotificationPriority } from "@/lib/notifications";
import { PRIORITY_ORDER } from "@/lib/notifications";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const CATEGORY_ICON: Record<string, string> = {
  booking_activity: "📋",
  client_update: "👤",
  system_warning: "⚠️",
  info: "ℹ️",
};

const PRIORITY_DOT: Record<NotificationPriority, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-blue-400",
  low: "bg-muted-foreground",
};

type GroupedActivity = {
  key: string;
  notifications: Notification[];
  latest: Notification;
  count: number;
};

function groupActivity(notifications: Notification[]): GroupedActivity[] {
  const groups = new Map<string, Notification[]>();
  for (const n of notifications) {
    const key = `${n.type}__${n.cta_href ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    notifications: items,
    latest: items[0],
    count: items.length,
  }));
}

export default function NotificationBell({
  initialUnreadCount,
}: {
  initialUnreadCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [loaded, setLoaded] = useState(false);
  const [, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  function handleOpen() {
    setOpen((v) => !v);
    if (!loaded) {
      startTransition(async () => {
        const data = await fetchNotificationsAction();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.is_read).length);
        setLoaded(true);
      });
    }
  }

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllReadAction();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    });
  }

  function handleMarkRead(ids: string[]) {
    startTransition(async () => {
      await markReadAction(ids);
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((c) =>
        Math.max(
          0,
          c -
            ids.filter((id) =>
              notifications.find((n) => n.id === id && !n.is_read),
            ).length,
        ),
      );
    });
  }

  function handleResolve(id: string) {
    startTransition(async () => {
      await resolveWarningAction(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_resolved: true, is_read: true } : n,
        ),
      );
    });
  }

  const warnings = notifications
    .filter((n) => n.category === "system_warning" && !n.is_resolved)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const activity = notifications
    .filter((n) => n.category !== "system_warning")
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  const grouped = groupActivity(activity);
  const hasUnread = unreadCount > 0;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        className="relative flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <BellIcon />
        {hasUnread && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[360px] max-w-[calc(100vw-2rem)] rounded-md border border-border bg-background shadow-lg flex flex-col max-h-[520px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {hasUnread && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {!loaded ? (
              <LoadingSkeleton />
            ) : notifications.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* Warnings pinned at top */}
                {warnings.length > 0 && (
                  <div className="border-b border-border">
                    <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Warnings
                    </p>
                    {warnings.map((n) => (
                      <WarningRow
                        key={n.id}
                        notification={n}
                        onResolve={() => handleResolve(n.id)}
                        onRead={() => !n.is_read && handleMarkRead([n.id])}
                      />
                    ))}
                  </div>
                )}

                {/* Activity */}
                {grouped.length > 0 && (
                  <div>
                    {warnings.length > 0 && (
                      <p className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        Activity
                      </p>
                    )}
                    {grouped.map((g) => (
                      <ActivityRow
                        key={g.key}
                        group={g}
                        onRead={() => {
                          const unreadIds = g.notifications
                            .filter((n) => !n.is_read)
                            .map((n) => n.id);
                          if (unreadIds.length) handleMarkRead(unreadIds);
                        }}
                        onClose={() => setOpen(false)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WarningRow({
  notification: n,
  onResolve,
  onRead,
}: {
  notification: Notification;
  onResolve: () => void;
  onRead: () => void;
}) {
  return (
    <div
      className={`px-4 py-3 border-b border-border/50 last:border-0 ${!n.is_read ? "bg-orange-500/5" : ""}`}
      onClick={onRead}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5 shrink-0">
          {CATEGORY_ICON[n.category]}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[n.priority]}`}
            />
            <p className="text-xs font-medium text-foreground">{n.title}</p>
            {!n.is_read && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {n.message}
          </p>
          <div className="flex items-center gap-3 pt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(n.created_at)}
            </span>
            {n.cta_href && n.cta_label && (
              <Link
                href={n.cta_href}
                className="text-[10px] text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
              >
                {n.cta_label}
              </Link>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResolve();
              }}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
            >
              Resolve
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({
  group: g,
  onRead,
  onClose,
}: {
  group: GroupedActivity;
  onRead: () => void;
  onClose: () => void;
}) {
  const n = g.latest;
  const isUnread = g.notifications.some((n) => !n.is_read);

  return (
    <div
      className={`px-4 py-3 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/20 transition-colors ${isUnread ? "bg-blue-500/5" : ""}`}
      onClick={onRead}
    >
      <div className="flex items-start gap-3">
        <span className="text-base mt-0.5 shrink-0">
          {CATEGORY_ICON[n.category]}
        </span>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-foreground truncate">
              {g.count > 1 ? `${g.count}× ${n.title}` : n.title}
            </p>
            {isUnread && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {g.count > 1 ? `Latest: ${n.message}` : n.message}
          </p>
          <div className="flex items-center gap-3 pt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {relativeTime(n.created_at)}
            </span>
            {n.cta_href && n.cta_label && (
              <Link
                href={n.cta_href}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="text-[10px] text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
              >
                {n.cta_label}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-0">
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-3 border-b border-border/50 flex gap-3">
          <div className="w-5 h-5 rounded bg-muted animate-pulse shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3 w-48 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm text-muted-foreground">No notifications yet.</p>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    </svg>
  );
}
