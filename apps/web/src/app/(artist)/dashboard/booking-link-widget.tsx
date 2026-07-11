"use client";

import { useState } from "react";
import { Link2, Copy, Check, ExternalLink } from "lucide-react";
import { Card, CardHeader, IconChip } from "@/components/ui/card";
import { recordBookingLinkCopiedAction } from "@/app/(artist)/growth-track-actions";

const ICON_BTN =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground";

// One shareable page link: label + bare URL on the left, compact outlined icon
// actions (copy + preview) pinned right. Mirrors the Action-required row layout
// but swaps the text verbs for symbols so the two cards read differently.
// Preview uses the absolute `url` (not `/${slug}`) so it resolves under
// subdomain routing too.
function LinkRow({
  label,
  url,
  trackCopy = false,
}: {
  label: string;
  url: string;
  trackCopy?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Growth signal only (fire-and-forget): sharing the booking link is the
      // step between "page live" and "first request" that canonical data
      // cannot see.
      if (trackCopy) void recordBookingLinkCopiedAction("dashboard");
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {url.replace(/^https?:\/\//, "")}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy ${label} link`}
          title={copied ? "Copied" : "Copy link"}
          className={ICON_BTN}
        >
          {copied ? (
            <Check className="h-4 w-4 text-brand-green" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Preview ${label}`}
          title="Preview"
          className={ICON_BTN}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}

// The artist's three public pages: the booking page, the waitlist, and the
// optional Link Hub. Share + preview each from one place.
export default function BookingLinkWidget({
  publicUrl,
  waitlistUrl,
  hubUrl,
}: {
  publicUrl: string;
  waitlistUrl: string;
  hubUrl: string;
}) {
  return (
    <Card className="space-y-4">
      <CardHeader>
        <IconChip icon={Link2} tint="bone" />
        <p className="text-sm font-medium text-foreground">Your pages</p>
      </CardHeader>
      <div className="divide-y divide-border">
        <LinkRow label="Booking" url={publicUrl} trackCopy />
        <LinkRow label="Waitlist" url={waitlistUrl} />
        <LinkRow label="Link Hub" url={hubUrl} />
      </div>
    </Card>
  );
}
