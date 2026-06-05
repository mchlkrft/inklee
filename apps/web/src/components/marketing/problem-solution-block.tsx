import type { ProblemPoint, SolutionPoint } from "@/lib/marketing";

type ProblemSolutionBlockProps = {
  problemHeading: string;
  problemBody?: string;
  problemPoints?: ProblemPoint[];
  solutionHeading: string;
  solutionBody?: string;
  solutionPoints?: SolutionPoint[];
};

export default function ProblemSolutionBlock({
  problemHeading,
  problemBody,
  problemPoints,
  solutionHeading,
  solutionBody,
  solutionPoints,
}: ProblemSolutionBlockProps) {
  return (
    <section className="border-t border-border">
      <div className="container-marketing py-20 md:py-24">
        <div className="grid gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              The problem
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-foreground md:text-3xl">
              {problemHeading}
            </h2>
            {problemBody && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {problemBody}
              </p>
            )}
            {problemPoints && problemPoints.length > 0 && (
              <ul className="mt-6 space-y-4">
                {problemPoints.map((p) => (
                  <li key={p.title} className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {p.title}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {p.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-mustard">
              With Inklee
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-foreground md:text-3xl">
              {solutionHeading}
            </h2>
            {solutionBody && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {solutionBody}
              </p>
            )}
            {solutionPoints && solutionPoints.length > 0 && (
              <ul className="mt-6 space-y-4">
                {solutionPoints.map((s) => (
                  <li key={s.title} className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {s.title}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {s.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
