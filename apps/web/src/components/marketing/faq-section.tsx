import type { FaqItem } from "@/lib/marketing";

type FaqSectionProps = {
  eyebrow?: string;
  heading?: string;
  items: FaqItem[];
};

export default function FaqSection({
  eyebrow = "FAQ",
  heading = "Tattoo booking, answered",
  items,
}: FaqSectionProps) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20 md:py-24">
      <div className="max-w-xl">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
        )}
        {heading && (
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            {heading}
          </h2>
        )}
      </div>
      <div className="mt-10 divide-y divide-border border-y border-border">
        {items.map((item) => (
          <details key={item.question} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
              <span className="text-base font-semibold text-foreground">
                {item.question}
              </span>
              <span
                aria-hidden="true"
                className="shrink-0 text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
