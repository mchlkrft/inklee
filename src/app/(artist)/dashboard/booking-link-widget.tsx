"use client";

import { useState } from "react";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { Card, CardHeader, IconChip } from "@/components/ui/card";

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
    <Card className="space-y-4">
      <CardHeader>
        <IconChip icon={Link2} tint="bone" />
        <p className="text-sm font-medium text-foreground">Booking link</p>
        <Link
          href="/bookings/booking-form"
          className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Edit
        </Link>
      </CardHeader>
      <p className="truncate font-mono text-sm text-muted-foreground">
        {publicUrl.replace(/^https?:\/\//, "")}
      </p>
      <div className="flex gap-2">
        <button
          onClick={copy}
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground"
        >
          Preview
        </a>
      </div>
    </Card>
  );
}
