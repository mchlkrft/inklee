import Link from "next/link";

/** Shared template for the head-to-head comparison pages
 *  (Inklee vs Calendly / Google Forms / Instagram DMs). Each consumer
 *  page provides content via props; this component handles the visual
 *  language (charcoal hero, bone definition, stacked colored problem
 *  cards, mustard solution, charcoal comparison grid, bone useful cards,
 *  charcoal wrong-job cards, bone FAQ, charcoal related, rosa final CTA). */

type Item = { title: string; description: string };
type Comparison = { feature: string; alt: string; inklee: string };
type Faq = { question: string; answer: string };
type Related = { title: string; description: string; href: string };

export type ComparePageProps = {
  alternativeName: string;
  alternativeLabel: string;
  inkleeLabel: string;
  eyebrow: string;
  heroHeadBlack: string;
  heroHeadMustard: string;
  subline: string;
  heroIllustration: string;
  /** Hero illustration max-width preset. "default" = small (xs/sm),
   *  "large" = one notch up (sm/lg). Per-page override. */
  heroSize?: "default" | "large";
  definitionEyebrow?: string;
  definitionHeading: [string, string];
  definitionBody: string[];
  definitionIllustration: string;
  problemHeading: [string, string];
  problemBody: string;
  problemPoints: Item[];
  solutionHeading: [string, string];
  solutionBody: string;
  solutionPoints: Item[];
  comparisonRows: Comparison[];
  usefulHeading: [string, string];
  usefulBody: string;
  usefulCards: Array<Item & { variant: "mustard" | "bone" | "rosa" }>;
  wrongJobHeading: [string, string];
  wrongJobBody: string;
  wrongJobCards: Item[];
  faq: Faq[];
  related: Related[];
  finalCtaHead: [string, string];
  finalCtaBody: string;
};

export default function ComparePageContent(p: ComparePageProps) {
  return (
    <>
      {/* Hero (charcoal) */}
      <section className="overflow-hidden md:flex md:min-h-[calc(100svh-80px)] md:items-center">
        <div className="container-marketing-wide">
          <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[5fr_7fr] md:gap-0">
            <div className="order-2 pb-10 pt-4 md:order-1 md:py-16 md:pr-10">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-shell-fg-dim">
                {p.eyebrow}
              </p>
              <h1 className="text-3xl font-black leading-[1.05] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                <span className="block">{p.heroHeadBlack}</span>
                <span className="block text-brand-mustard">
                  {p.heroHeadMustard}
                </span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-5 md:text-base">
                {p.subline}
              </p>
              <div className="mt-6 flex flex-wrap gap-3 md:mt-8">
                <Link
                  href="/signup"
                  className="inline-flex items-center rounded-full bg-brand-mustard px-6 py-3 text-base font-bold text-brand-charcoal transition-opacity hover:opacity-90"
                >
                  Create your booking link
                </Link>
                <Link
                  href="/tattoo-booking-software"
                  className="inline-flex items-center rounded-full border-[1.5px] border-shell-border px-6 py-3 text-base font-bold text-shell-fg-dim transition-colors hover:border-shell-fg hover:text-foreground"
                >
                  See the booking tool →
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-3 md:mt-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/badges/badge-handmade.svg"
                  alt="Made by hand"
                  className="h-12 w-12 md:h-14 md:w-14"
                  draggable={false}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/badges/badge-gdpr.svg"
                  alt="GDPR compliant"
                  className="h-12 w-12 md:h-14 md:w-14"
                  draggable={false}
                />
              </div>
            </div>
            <div className="order-1 flex justify-center pt-5 md:order-2 md:pt-0">
              <div
                className={`animate-hero-float w-full ${
                  p.heroSize === "large"
                    ? "max-w-sm md:max-w-lg"
                    : "max-w-2xs md:max-w-sm"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.heroIllustration}
                  alt=""
                  aria-hidden="true"
                  className="h-auto w-full"
                  draggable={false}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Definition (bone) */}
      <section
        data-appearance="light"
        className="bg-brand-bone text-brand-charcoal"
      >
        <div className="container-marketing py-20 md:py-28">
          <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-[6fr_6fr] md:gap-16">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.definitionIllustration}
                alt=""
                aria-hidden="true"
                className="mx-auto h-auto w-full max-w-sm md:mx-0 md:max-w-md"
                draggable={false}
              />
            </div>
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                {p.definitionEyebrow ?? "Why this comparison matters"}
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
                {p.definitionHeading[0]}
                <br />
                {p.definitionHeading[1]}
              </h2>
              {p.definitionBody.map((para, i) => (
                <p
                  key={i}
                  className={`max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg ${i === 0 ? "mt-6" : "mt-4"}`}
                >
                  {para}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Problem (charcoal, stacked colored cards) */}
      <section className="bg-shell-bg text-shell-fg">
        <div className="container-marketing py-24 md:py-32">
          <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-[5fr_7fr] md:gap-16">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
                Where the wrong tool hurts
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
                {p.problemHeading[0]}
                <br />
                {p.problemHeading[1]}
              </h2>
              <p className="mt-6 max-w-md text-base leading-relaxed text-shell-fg-dim md:text-lg">
                {p.problemBody}
              </p>
            </div>
            <div className="space-y-4 md:space-y-5">
              {p.problemPoints.map((point, i) => {
                const variants = [
                  "mustard",
                  "bone",
                  "rosa",
                  "bone",
                  "mustard",
                  "rosa",
                ];
                const v = variants[i % variants.length];
                const bg =
                  v === "mustard"
                    ? "bg-brand-mustard"
                    : v === "rosa"
                      ? "bg-brand-rosa"
                      : "bg-brand-bone";
                return (
                  <div
                    key={point.title}
                    className={`flex flex-col gap-2 rounded-3xl p-6 md:p-7 ${bg}`}
                  >
                    <h3 className="text-lg font-black leading-tight text-brand-charcoal md:text-xl">
                      {point.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-brand-charcoal/75">
                      {point.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Solution (mustard) */}
      <section className="bg-brand-mustard">
        <div className="container-marketing py-20 md:py-28">
          <div className="mb-12 max-w-3xl md:mb-16">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
              How Inklee fits
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-5xl lg:text-6xl">
              {p.solutionHeading[0]}
              <br />
              {p.solutionHeading[1]}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              {p.solutionBody}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {p.solutionPoints.map((s, i) => (
              <div
                key={s.title}
                className="flex flex-col gap-3 rounded-3xl bg-brand-charcoal/8 p-5"
              >
                <span className="text-3xl font-black leading-none text-brand-charcoal md:text-4xl">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="text-base font-black leading-tight text-brand-charcoal">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-brand-charcoal/75">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison (charcoal grid) */}
      <section className="bg-shell-bg text-shell-fg">
        <div className="container-marketing py-24 md:py-32">
          <div className="mb-12 max-w-3xl md:mb-16">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
              Side by side
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
              {p.alternativeLabel} vs {p.inkleeLabel}.
            </h2>
          </div>
          <div className="overflow-hidden rounded-3xl border-[1.5px] border-shell-border bg-[#252525]">
            <div className="grid grid-cols-1 gap-px bg-shell-border md:grid-cols-3">
              <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                Feature
              </div>
              <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-shell-fg-dim">
                {p.alternativeLabel}
              </div>
              <div className="bg-[#252525] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-mustard">
                {p.inkleeLabel}
              </div>
              {p.comparisonRows.map((row) => (
                <div key={row.feature} className="contents">
                  <div className="bg-[#252525] px-5 py-4 text-sm font-bold text-shell-fg">
                    {row.feature}
                  </div>
                  <div className="bg-[#252525] px-5 py-4 text-sm text-shell-fg-dim">
                    {row.alt}
                  </div>
                  <div className="bg-[#252525] px-5 py-4 text-sm text-shell-fg">
                    {row.inklee}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Useful (bone) */}
      <section
        data-appearance="light"
        className="bg-brand-bone text-brand-charcoal"
      >
        <div className="container-marketing py-24 md:py-32">
          <div className="mb-12 max-w-2xl md:mb-16">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
              Where {p.alternativeName} still works
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl lg:text-6xl">
              {p.usefulHeading[0]}
              <br />
              {p.usefulHeading[1]}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              {p.usefulBody}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6">
            {p.usefulCards.map((c) => {
              const bg =
                c.variant === "mustard"
                  ? "bg-brand-mustard"
                  : c.variant === "rosa"
                    ? "bg-brand-rosa"
                    : "bg-[#d9d4c7]";
              return (
                <div
                  key={c.title}
                  className={`flex h-full flex-col gap-3 rounded-3xl p-7 ${bg}`}
                >
                  <h3 className="text-2xl font-black leading-tight text-brand-charcoal">
                    {c.title}
                  </h3>
                  <p className="text-base leading-relaxed text-brand-charcoal/75">
                    {c.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Wrong job (charcoal) */}
      <section className="bg-shell-bg text-shell-fg">
        <div className="container-marketing py-24 md:py-32">
          <div className="mb-12 max-w-2xl md:mb-16">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
              Where {p.alternativeName} breaks
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl lg:text-6xl">
              {p.wrongJobHeading[0]}
              <br />
              {p.wrongJobHeading[1]}
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-shell-fg-dim md:text-lg">
              {p.wrongJobBody}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:gap-6">
            {p.wrongJobCards.map((c, i) => {
              const variants = ["mustard", "bone", "rosa", "bone"];
              const v = variants[i % variants.length];
              const bg =
                v === "mustard"
                  ? "bg-brand-mustard"
                  : v === "rosa"
                    ? "bg-brand-rosa"
                    : "bg-brand-bone";
              return (
                <div
                  key={c.title}
                  className={`flex h-full flex-col gap-3 rounded-3xl p-7 ${bg}`}
                >
                  <h3 className="text-2xl font-black leading-tight text-brand-charcoal">
                    {c.title}
                  </h3>
                  <p className="text-base leading-relaxed text-brand-charcoal/75">
                    {c.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ (bone) */}
      <section
        data-appearance="light"
        className="bg-brand-bone text-brand-charcoal"
      >
        <div className="container-marketing py-24 md:py-32">
          <div className="mx-auto max-w-3xl">
            <div className="mb-12 text-center">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-charcoal/70">
                FAQ
              </p>
              <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">
                {p.alternativeName} vs Inklee, answered.
              </h2>
            </div>
            <div className="rounded-3xl border-[1.5px] border-brand-charcoal/15 bg-[#d9d4c7] px-6 md:px-10">
              {p.faq.map((item, idx) => {
                const number = String(idx + 1).padStart(2, "0");
                const isLast = idx === p.faq.length - 1;
                return (
                  <details
                    key={item.question}
                    className={`group py-5 ${isLast ? "" : "border-b border-brand-charcoal/15"}`}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                      <div className="flex items-baseline gap-5">
                        <span className="text-xs font-black uppercase tracking-[0.18em] text-brand-charcoal/70">
                          {number}
                        </span>
                        <span className="text-lg font-bold text-brand-charcoal">
                          {item.question}
                        </span>
                      </div>
                      <span
                        aria-hidden="true"
                        className="text-2xl font-black text-brand-charcoal/60 transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-3 max-w-2xl pl-[3.25rem] text-sm leading-relaxed text-brand-charcoal/75">
                      {item.answer}
                    </p>
                  </details>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Related (charcoal) */}
      <section className="bg-shell-bg text-shell-fg">
        <div className="container-marketing py-20 md:py-28">
          <div className="mb-12 max-w-2xl">
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-mustard">
              More to read
            </p>
            <h2 className="text-4xl font-black leading-tight tracking-tight text-shell-fg md:text-5xl">
              Keep going.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
            {p.related.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex h-full flex-col justify-between gap-6 rounded-3xl border-[1.5px] border-shell-border p-6 transition-colors hover:border-shell-fg hover:bg-[#252525]"
              >
                <div className="space-y-3">
                  <h3 className="text-xl font-black leading-tight text-shell-fg">
                    {link.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-shell-fg-dim">
                    {link.description}
                  </p>
                </div>
                <span className="text-sm font-bold text-shell-fg-dim transition-colors group-hover:text-shell-fg">
                  Read more →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA (rosa) */}
      <section className="bg-brand-rosa">
        <div className="container-marketing py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/branding/illustrations/easy-peasy.svg"
              alt=""
              aria-hidden="true"
              className="mx-auto mb-8 h-28 w-auto md:h-36"
              draggable={false}
            />
            <h2 className="text-4xl font-black leading-tight tracking-tight text-brand-charcoal md:text-6xl lg:text-7xl">
              {p.finalCtaHead[0]}
              <br />
              {p.finalCtaHead[1]}
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-brand-charcoal/75 md:text-lg">
              {p.finalCtaBody}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center rounded-full bg-brand-charcoal px-6 py-3 text-base font-bold text-brand-bone transition-opacity hover:opacity-90"
              >
                Create your booking link
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
