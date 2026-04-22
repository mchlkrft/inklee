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
    <div className="rounded-md border border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">booking link</p>
        <Link
          href="/bookings/public-page"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          manage →
        </Link>
      </div>
      <p className="text-sm text-muted-foreground font-mono truncate">
        {publicUrl.replace(/^https?:\/\//, "")}
      </p>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="text-xs rounded border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          {copied ? "copied!" : "copy link"}
        </button>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs rounded border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
        >
          preview ↗
        </a>
      </div>
    </div>
  );
}
