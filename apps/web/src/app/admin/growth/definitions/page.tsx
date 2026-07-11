import { Fragment } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import { SectionHeading } from "@/components/admin/growth/metric-card";
import {
  KNOWN_LIMITATIONS,
  METRIC_DEFINITIONS,
  type MetricDefinition,
} from "@/lib/growth/definitions-content";

/** dl rows rendered per definition card, in display order. */
const DETAIL_FIELDS: {
  label: string;
  key: keyof Omit<MetricDefinition, "name" | "plainLanguage">;
}[] = [
  { label: "Calculation", key: "calculation" },
  { label: "Sources", key: "sources" },
  { label: "Inclusions", key: "inclusions" },
  { label: "Exclusions", key: "exclusions" },
  { label: "Timezone", key: "timezone" },
  { label: "Refresh", key: "refresh" },
  { label: "Limitations", key: "limitations" },
  { label: "Last changed", key: "lastChanged" },
];

export default async function GrowthDefinitionsPage() {
  await requireAdmin();

  return (
    <div className="space-y-10">
      <p className="text-sm text-muted-foreground">
        These definitions are the single source of truth for every number in the
        cockpit. The same content lives in docs/metric-definitions.md.
      </p>

      <section className="space-y-3">
        <SectionHeading>Metric definitions</SectionHeading>
        <div className="space-y-4">
          {METRIC_DEFINITIONS.map((definition) => (
            <article
              key={definition.name}
              className="rounded-md border border-border p-5 space-y-3"
            >
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  {definition.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {definition.plainLanguage}
                </p>
              </div>
              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-4">
                {DETAIL_FIELDS.map((field) => (
                  <Fragment key={field.key}>
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="text-foreground">{definition[field.key]}</dd>
                  </Fragment>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeading>Known limitations</SectionHeading>
        <div className="rounded-md border border-border p-5">
          <ul className="space-y-2">
            {KNOWN_LIMITATIONS.map((limitation) => (
              <li
                key={limitation}
                className="flex gap-2 text-sm text-muted-foreground"
              >
                <span aria-hidden="true" className="select-none">
                  &bull;
                </span>
                <span>{limitation}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
