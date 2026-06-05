"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "Copy link",
  copiedLabel = "Copied!",
  className = "",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      className={`rounded border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
