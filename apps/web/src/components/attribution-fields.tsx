"use client";

import { useEffect, useState } from "react";
import {
  ATTRIBUTION_PROP_KEYS,
  attributionFieldName,
  type AttributionProps,
} from "@/lib/analytics-gates";
import { getStoredAttribution } from "@/lib/track";

/**
 * Hidden inputs that carry the browser's first-touch marketing attribution
 * (entry path, external referrer origin, utm source/medium/campaign) into a
 * server-action form submit: the privacy-safe, cookie-free way to hand
 * attribution to a server-side conversion event (booking_link_created).
 * Values are re-validated and length-clamped server-side in
 * attributionPropsFromForm before use.
 */
export default function AttributionFields() {
  const [attribution, setAttribution] = useState<AttributionProps>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard "read external store after hydration" seed
    setAttribution(getStoredAttribution());
  }, []);

  return (
    <>
      {ATTRIBUTION_PROP_KEYS.map((key) => {
        const value = attribution[key];
        if (!value) return null;
        return (
          <input
            key={key}
            type="hidden"
            name={attributionFieldName(key)}
            value={value}
          />
        );
      })}
    </>
  );
}
