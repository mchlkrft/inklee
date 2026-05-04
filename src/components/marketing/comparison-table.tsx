import type { ComparisonRow } from "@/lib/marketing";

type ComparisonTableProps = {
  heading: string;
  intro?: string;
  alternativeLabel: string;
  inkleeLabel?: string;
  rows: ComparisonRow[];
  note?: string;
};

export default function ComparisonTable({
  heading,
  intro,
  alternativeLabel,
  inkleeLabel = "Inklee",
  rows,
  note,
}: ComparisonTableProps) {
  return (
    <section className="border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-20 md:py-24">
        <div className="max-w-xl">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            {heading}
          </h2>
          {intro && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              {intro}
            </p>
          )}
        </div>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Feature
                </th>
                <th className="py-3 pr-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {alternativeLabel}
                </th>
                <th className="py-3 text-xs font-semibold uppercase tracking-widest text-brand-mustard">
                  {inkleeLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-b border-border">
                  <td className="py-4 pr-4 align-top font-medium text-foreground">
                    {row.feature}
                  </td>
                  <td className="py-4 pr-4 align-top leading-relaxed text-muted-foreground">
                    {row.alternative}
                  </td>
                  <td className="py-4 align-top leading-relaxed text-foreground">
                    {row.inklee}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {note && (
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            {note}
          </p>
        )}
      </div>
    </section>
  );
}
