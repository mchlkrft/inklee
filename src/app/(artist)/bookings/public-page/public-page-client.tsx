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
      {/* URL bar */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-3">
        <span className="flex-1 text-sm text-foreground font-mono truncate">
          {publicUrl.replace(/^https?:\/\//, "")}
        </span>
        <button
          onClick={copyUrl}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground"
        >
          {copied ? "copied!" : "copy"}
        </button>
        <a
          href={`/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground"
        >
          preview ↗
        </a>
      </div>

      {/* QR code */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">qr code</p>
        <div className="w-fit rounded-md border border-border p-3 bg-[#09090b]">
          <canvas ref={canvasRef} />
        </div>
        <p className="text-xs text-muted-foreground">
          right-click to save for print or in-person sharing
        </p>
      </div>
    </div>
  );
}
