import Link from "next/link";
import type { CtaLink } from "@/lib/marketing";

const VARIANT_CLASSES: Record<NonNullable<CtaLink["variant"]>, string> = {
  primary:
    "rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90",
  secondary:
    "rounded-full border border-foreground/20 px-6 py-3 text-base font-bold text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground",
};

export default function CtaButton({ cta }: { cta: CtaLink }) {
  const variant = cta.variant ?? "primary";
  const className = VARIANT_CLASSES[variant];
  if (cta.external) {
    return (
      <a
        href={cta.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {cta.label}
      </a>
    );
  }
  return (
    <Link href={cta.href} className={className}>
      {cta.label}
    </Link>
  );
}
