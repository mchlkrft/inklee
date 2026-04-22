"use client";

import { useState } from "react";
import Link from "next/link";

export default function BookingLinkWidget({
  publicUrl,
  slug,
}: {
  publicUrl: string;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Booking link</p>
        <Link
          href="/bookings/public-page"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Manage
        </Link>
      </div>
      <p className="truncate font-mono text-sm text-muted-foreground">
        {publicUrl.replace(/^https?:\/\//, "")}
      </p>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          Preview
        </a>
      </div>
    </div>
  );
}
