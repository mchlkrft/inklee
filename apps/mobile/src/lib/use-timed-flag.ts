import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A boolean that flips on via trigger() and auto-clears after `ms` — the
 * "Copied" / "Saved." feedback pattern that was hand-rolled (with leaky
 * setTimeout, no unmount cleanup) at six screens. Clears its timer on unmount
 * and on re-trigger.
 */
export function useTimedFlag(ms = 2000): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const trigger = useCallback(() => {
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms]);

  return [on, trigger];
}
