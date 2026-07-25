// The shared plan/pricing checkmark: a filled mustard circle with a charcoal
// check inside (founder 2026-07-25: better visibility than a bare glyph, and it
// reads identically on light bone cards, the charcoal Plus card, and the app
// settings surface). Used by /pricing and /settings/plan; keep them in lockstep.
export default function CheckBadge() {
  return (
    <span
      aria-hidden
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-mustard text-[11px] font-black leading-none text-brand-charcoal"
    >
      &#10003;
    </span>
  );
}
