import type { MarketingHeroProps } from "@/lib/marketing";
import CtaButton from "./cta-button";

export default function MarketingHero({
  eyebrow,
  heading,
  subhead,
  primaryCta,
  secondaryCta,
  proof,
  visual,
}: MarketingHeroProps) {
  return (
    <section className="overflow-hidden md:flex md:min-h-[calc(100svh-87px)] md:items-center">
      <div className="container-marketing-wide">
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
          <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
            {eyebrow && (
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
              {heading}
            </h1>
            <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg md:mt-5">
              {subhead}
            </p>
            {(primaryCta || secondaryCta) && (
              <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                {primaryCta && <CtaButton cta={primaryCta} />}
                {secondaryCta && <CtaButton cta={secondaryCta} />}
              </div>
            )}
            {proof && (
              <p className="mt-4 text-sm text-muted-foreground">{proof}</p>
            )}
          </div>
          {visual && (
            <div className="order-1 flex justify-center md:order-2 md:justify-end md:-mr-8 lg:-mr-16">
              <div className="w-full max-w-sm md:max-w-full">{visual}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
