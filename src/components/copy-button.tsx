"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "copy link",
  copiedLabel = "copied!",
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
      className={`text-xs rounded border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors ${className}`}
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
