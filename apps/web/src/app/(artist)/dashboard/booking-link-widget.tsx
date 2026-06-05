"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { Card, CardHeader, IconChip } from "@/components/ui/card";

// One shareable link: label, the bare URL, a copy button, and a preview that
// opens the real public URL. Preview uses the absolute `url` (not `/${slug}`)
// so it resolves correctly under subdomain routing too.
function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-mono text-sm text-muted-foreground">
        {url.replace(/^https?:\/\//, "")}
      </p>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground"
        >
          Preview
        </a>
      </div>
    </div>
  );
}

export default function BookingLinkWidget({
  publicUrl,
  waitlistUrl,
}: {
  publicUrl: string;
  waitlistUrl: string;
}) {
  return (
    <Card className="space-y-4">
      <CardHeader>
        <IconChip icon={Link2} tint="bone" />
        <p className="text-sm font-medium text-foreground">Your links</p>
        <Link
          href="/bookings/booking-form"
          className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Edit
        </Link>
      </CardHeader>
      <LinkRow label="Booking link" url={publicUrl} />
      <LinkRow label="Waitlist link" url={waitlistUrl} />
    </Card>
  );
}
