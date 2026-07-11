/**
 * Reconnect banner for the Search group. Search Console auth can expire (Google
 * rejects the stored refresh token) without disconnecting the row, so the pages
 * keep rendering the last-synced, now frozen data. Render this whenever
 * getGscConnectionState().needsReconnect is true so stale numbers always carry
 * a fix-it CTA. Server component (no interactivity).
 */
export default function GscReconnectBanner({
  needsReconnect,
}: {
  needsReconnect: boolean;
}) {
  if (!needsReconnect) return null;
  return (
    <div className="rounded-md border border-brand-mustard/40 bg-brand-mustard/10 px-4 py-3">
      <p className="text-sm text-foreground">
        Search Console authorization expired, so the numbers below are frozen at
        the last successful sync. Reconnect to resume syncing.
      </p>
      {/* Plain anchor, not next/link: this is an API route that performs a
          server-side OAuth redirect, not an in-app page navigation. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/api/admin/gsc/connect"
        className="mt-2 inline-flex rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Reconnect Google Search Console
      </a>
    </div>
  );
}
