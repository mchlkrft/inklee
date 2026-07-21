"use client";

import { useState, useEffect } from "react";

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
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Inklee uses strictly necessary session cookies for artist login. No
          tracking cookies.{" "}
          {/* Plain <a>, not <Link>: the banner mounts in the root layout and
              renders on artist subdomains, where /privacy only resolves via
              the proxy's apex-only redirect (host.ts APEX_ONLY_PREFIXES). A
              document navigation follows that redirect cleanly; a client-side
              RSC navigation would not. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/privacy"
            className="text-foreground underline underline-offset-4"
          >
            Privacy policy
          </a>
        </p>
        <button
          onClick={dismiss}
          className="shrink-0 rounded-full bg-brand-mustard px-5 py-1.5 text-xs font-medium text-brand-charcoal"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
