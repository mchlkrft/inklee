"use client";

import { useMemo, useState } from "react";

/**
 * Filterable Search Console dimension table (queries and pages). Receives the
 * current and previous GSC windows already fetched server-side, joins them by
 * dimension value, and filters client-side (capped at 250 rows, so no server
 * round-trip is needed).
 *
 * Sign conventions: click and impression changes are current minus previous;
 * position change is previous minus current, so a positive number always
 * means "better". Rows without a previous counterpart show "new" only when
 * the previous window returned any rows at all; when the previous window is
 * entirely empty (e.g. before a backfill) every comparison is hidden rather
 * than pretending the whole table is new.
 */

/** Shape of gscDimensionAgg rows (redeclared: the query layer is server-only). */
export type GscSourceRow = {
  dimension_value: string;
  clicks: number;
  impressions: number;
  ctr: number;
  average_position: number;
};

type JoinedRow = {
  key: string;
  display: string;
  title: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  clicksChange: number | null;
  impressionsChange: number | null;
  positionChange: number | null;
  isNew: boolean;
};

const INKLEE_ORIGIN = "https://inklee.app";

function toDisplay(
  variant: "query" | "page",
  value: string,
): { display: string; title: string } {
  if (variant === "page" && value.startsWith(INKLEE_ORIGIN)) {
    const path = value.slice(INKLEE_ORIGIN.length);
    return { display: path === "" ? "/" : path, title: value };
  }
  return { display: value, title: value };
}

/** Fixed locale so the server render and hydration agree. */
function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function ChangeCell({
  value,
  isNew = false,
  decimals = 0,
}: {
  value: number | null;
  isNew?: boolean;
  decimals?: number;
}) {
  if (isNew) {
    return (
      <td className="px-3 py-2 text-right">
        <span className="inline-block rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          new
        </span>
      </td>
    );
  }
  if (value === null) {
    return (
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        –
      </td>
    );
  }
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  if (rounded === 0) {
    return (
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        0
      </td>
    );
  }
  const magnitude =
    decimals > 0
      ? Math.abs(rounded).toFixed(decimals)
      : formatCount(Math.abs(rounded));
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${
        rounded > 0 ? "text-brand-green" : "text-brand-red"
      }`}
    >
      {rounded > 0 ? `+${magnitude}` : `-${magnitude}`}
    </td>
  );
}

export default function GscDimensionTable({
  variant,
  current,
  previous,
}: {
  variant: "query" | "page";
  current: GscSourceRow[];
  previous: GscSourceRow[];
}) {
  const [filter, setFilter] = useState("");

  const rows = useMemo<JoinedRow[]>(() => {
    const hasPrevious = previous.length > 0;
    const prevByKey = new Map(
      previous.map((row) => [row.dimension_value, row]),
    );
    return current.map((row) => {
      const prev = hasPrevious ? prevByKey.get(row.dimension_value) : undefined;
      const { display, title } = toDisplay(variant, row.dimension_value);
      return {
        key: row.dimension_value,
        display,
        title,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.average_position,
        clicksChange: prev ? row.clicks - prev.clicks : null,
        impressionsChange: prev ? row.impressions - prev.impressions : null,
        positionChange:
          prev && prev.average_position > 0 && row.average_position > 0
            ? prev.average_position - row.average_position
            : null,
        isNew: hasPrevious && !prev,
      };
    });
  }, [variant, current, previous]);

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? rows.filter(
        (row) =>
          row.key.toLowerCase().includes(needle) ||
          row.display.toLowerCase().includes(needle),
      )
    : rows;

  const noun = variant === "query" ? "queries" : "pages";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={`Filter ${noun}`}
          aria-label={`Filter ${noun}`}
          className="w-56 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
        />
        <p className="text-xs tabular-nums text-muted-foreground">
          {needle
            ? `${visible.length} of ${rows.length} rows`
            : `${rows.length} rows`}
        </p>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">
                {variant === "query" ? "Query" : "Page"}
              </th>
              <th className="px-3 py-2 text-right font-medium">Clicks</th>
              <th className="px-3 py-2 text-right font-medium">Impressions</th>
              <th className="px-3 py-2 text-right font-medium">CTR</th>
              <th className="px-3 py-2 text-right font-medium">Position</th>
              <th className="px-3 py-2 text-right font-medium">Click change</th>
              <th className="px-3 py-2 text-right font-medium">
                Impression change
              </th>
              <th className="px-3 py-2 text-right font-medium">
                Position change
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-t border-border">
                <td
                  className="max-w-[320px] px-3 py-2 text-foreground"
                  title={row.title}
                >
                  <span className="block truncate">{row.display}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatCount(row.clicks)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">
                  {formatCount(row.impressions)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.impressions > 0 ? `${(row.ctr * 100).toFixed(1)}%` : "–"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.position > 0 ? row.position.toFixed(1) : "–"}
                </td>
                <ChangeCell value={row.clicksChange} isNew={row.isNew} />
                <ChangeCell value={row.impressionsChange} />
                <ChangeCell value={row.positionChange} decimals={1} />
              </tr>
            ))}
            {visible.length === 0 && (
              <tr className="border-t border-border">
                <td
                  colSpan={8}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No rows match the filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
