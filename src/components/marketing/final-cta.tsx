import type { CtaLink } from "@/lib/marketing";
import CtaButton from "./cta-button";

type FinalCtaProps = {
  heading: string;
  subhead?: string;
  primaryCta?: CtaLink;
  secondaryCta?: CtaLink;
};

export default function FinalCta({
  heading,
  subhead,
  primaryCta,
  secondaryCta,
}: FinalCtaProps) {
  return (
    <section className="px-6 py-24 text-center">
      <div className="mx-auto max-w-md">
        <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {heading}
        </h2>
        {subhead && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {subhead}
          </p>
        )}
        {(primaryCta || secondaryCta) && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {primaryCta && <CtaButton cta={primaryCta} />}
            {secondaryCta && <CtaButton cta={secondaryCta} />}
          </div>
        )}
      </div>
    </section>
  );
}
