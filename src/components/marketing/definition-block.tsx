type DefinitionBlockProps = {
  eyebrow?: string;
  heading: string;
  body: string | string[];
  bullets?: string[];
  highlightedTerm?: string;
};

export default function DefinitionBlock({
  eyebrow,
  heading,
  body,
  bullets,
  highlightedTerm,
}: DefinitionBlockProps) {
  const paragraphs = Array.isArray(body) ? body : [body];
  return (
    <section className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <div className="grid gap-10 md:grid-cols-[5fr_7fr] md:gap-16">
        <div>
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground md:text-4xl">
            {heading}
          </h2>
          {highlightedTerm && (
            <p className="mt-4 text-sm font-semibold text-brand-mustard">
              {highlightedTerm}
            </p>
          )}
        </div>
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground md:text-base">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {bullets && bullets.length > 0 && (
            <ul className="space-y-2 pt-1">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-mustard"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
