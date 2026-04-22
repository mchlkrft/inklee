"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export default function PublicPageClient({
  publicUrl,
  slug,
}: {
  publicUrl: string;
  slug: string;
}) {
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, publicUrl, {
        width: 160,
        margin: 1,
        color: { dark: "#ffffff", light: "#09090b" },
      }).catch(console.error);
    }
  }, [publicUrl]);

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3">
        <span className="flex-1 truncate font-mono text-sm text-foreground">
          {publicUrl.replace(/^https?:\/\//, "")}
        </span>
        <button
          onClick={copyUrl}
          className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        >
          Preview
        </a>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">QR code</p>
        <div className="w-fit rounded-md border border-border bg-[#09090b] p-3">
          <canvas ref={canvasRef} />
        </div>
        <p className="text-xs text-muted-foreground">
          Right-click to save for print or in-person sharing.
        </p>
      </div>
    </div>
  );
}
