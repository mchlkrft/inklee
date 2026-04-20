"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function CookieBanner() {
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(!localStorage.getItem("cookie-ok"));
  }, []);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem("cookie-ok", "1");
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background px-6 py-4">
      <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          inklee uses strictly necessary session cookies for artist login. no
          tracking cookies.{" "}
          <Link
            href="/privacy"
            className="text-foreground underline underline-offset-4"
          >
            privacy policy
          </Link>
        </p>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-md bg-foreground px-4 py-1.5 text-xs font-medium text-background"
        >
          got it
        </button>
      </div>
    </div>
  );
}
