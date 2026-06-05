import type { FeatureBenefitItem } from "@/lib/marketing";

type FeatureBenefitGridProps = {
  heading?: string;
  intro?: string;
  items: FeatureBenefitItem[];
  columns?: 2 | 3;
};

const COLUMN_CLASSES: Record<2 | 3, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 md:grid-cols-3",
};

export default function FeatureBenefitGrid({
  heading,
  intro,
  items,
  columns = 3,
}: FeatureBenefitGridProps) {
  return (
    <section className="container-marketing py-20 md:py-24">
      {(heading || intro) && (
        <div className="mb-10 max-w-xl">
          {heading && (
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
              {heading}
            </h2>
          )}
          {intro && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              {intro}
            </p>
          )}
        </div>
      )}
      <div
        className={`grid grid-cols-1 gap-10 ${COLUMN_CLASSES[columns]} md:gap-x-12 md:gap-y-14`}
      >
        {items.map((item) => (
          <div key={item.title} className="space-y-3">
            {item.label && (
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {item.label}
              </p>
            )}
            <p className="text-base font-semibold text-foreground">
              {item.title}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
