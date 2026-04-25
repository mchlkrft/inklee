"use client";

import { useEffect, useRef, useState } from "react";

// ─── Icon manifests ───────────────────────────────────────────────────────────
// Dark set:  /icons/dark/Animation-Emoji-01.svg … 09.svg
// Light set: /icons/light/Animation-Emoji-10.svg … 18.svg

const DARK_ICONS = Array.from(
  { length: 9 },
  (_, i) => `/icons/dark/Animation-Emoji-0${i + 1}.svg`,
);
const LIGHT_ICONS = Array.from(
  { length: 9 },
  (_, i) => `/icons/light/Animation-Emoji-${10 + i}.svg`,
);

const FADE_MS = 260;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BrandLoaderProps {
  /** Icon display size in px. Default 96. */
  size?: number;
  /** Total time (ms) per icon including fade transitions. Default 2000. */
  interval?: number;
  /** Optional text shown below the icon. */
  label?: string;
  /** Custom icon order (0-based indices 0–8). Default: sequential. */
  order?: number[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BrandLoader({
  size = 96,
  interval = 2000,
  label,
  order,
}: BrandLoaderProps) {
  const [isDark, setIsDark] = useState(true);
  const [step, setStep] = useState(0); // position in the order array
  const [visible, setVisible] = useState(true);
  const [isFloating, setIsFloating] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Theme detection ─────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);

  // ── Reduced-motion preference (listen for runtime changes) ──────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Cycling logic ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (reducedMotion) return; // static icon, no cycling

    function runCycle() {
      // 1. Fade in → float
      setVisible(true);
      timerRef.current = setTimeout(() => {
        setIsFloating(true);

        // 2. After hold, stop float + fade out
        timerRef.current = setTimeout(
          () => {
            setIsFloating(false);
            setVisible(false);

            // 3. Swap icon after fade-out completes
            timerRef.current = setTimeout(() => {
              setStep((s) => (s + 1) % (order?.length ?? 9));
              runCycle();
            }, FADE_MS);
          },
          Math.max(interval - FADE_MS * 2, 400),
        );
      }, FADE_MS);
    }

    runCycle();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [interval, order, reducedMotion]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const icons = isDark ? DARK_ICONS : LIGHT_ICONS;
  const sequence = order ?? Array.from({ length: 9 }, (_, i) => i);
  const src = icons[sequence[step] ?? 0];

  const opacityStyle = reducedMotion ? 1 : visible ? 1 : 0;
  const scaleStyle = reducedMotion ? 1 : visible ? 1 : 0.9;

  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className="flex flex-col items-center gap-3"
    >
      <div
        style={{
          width: size,
          height: size,
          opacity: opacityStyle,
          transform: `scale(${scaleStyle})`,
          transition: reducedMotion
            ? "none"
            : `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`,
          animation:
            isFloating && !reducedMotion
              ? "inklee-float 2.6s ease-in-out infinite"
              : "none",
          willChange: "transform, opacity",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          style={{ display: "block" }}
        />
      </div>

      {label && (
        <p className="text-xs text-muted-foreground tracking-wide">{label}</p>
      )}
    </div>
  );
}
