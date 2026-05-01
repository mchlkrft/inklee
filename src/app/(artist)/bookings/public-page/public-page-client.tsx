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
        width: 96,
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

  function downloadQR() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-qr.png`;
    a.click();
  }

  return (
    <div className="rounded-md border-2 border-border divide-y divide-border">
      {/* Link row */}
      <div className="flex items-center gap-2 px-4 py-3">
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

      {/* QR row */}
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="shrink-0 rounded-md bg-[#09090b] p-2">
          <canvas ref={canvasRef} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">QR code</p>
          <button
            onClick={downloadQR}
            className="rounded border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            Download PNG
          </button>
          <p className="text-xs text-muted-foreground">
            For print or in-person sharing.
          </p>
        </div>
      </div>
    </div>
  );
}
