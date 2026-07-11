/**
 * Dependency-free inline SVG sparkline (the repo deliberately has no chart
 * library; all charts are CSS or inline SVG). Uses currentColor so it follows
 * the surrounding text token in both themes. Server-safe.
 */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className={className}
        aria-hidden
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 2;
  const points = values
    .map((value, index) => {
      const x = pad + (index / (values.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (value - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Simple CSS bar series (day/week buckets) for slightly richer trends. */
export function BarSeries({
  values,
  labels,
  maxBars = 60,
}: {
  values: number[];
  labels?: string[];
  maxBars?: number;
}) {
  const shown = values.slice(-maxBars);
  const shownLabels = labels?.slice(-maxBars);
  const max = Math.max(...shown, 1);
  return (
    <div className="flex h-24 items-end gap-[2px]">
      {shown.map((value, index) => (
        <div
          key={index}
          className="min-w-[3px] flex-1 rounded-sm bg-brand-mustard/70"
          style={{ height: `${Math.max(2, (value / max) * 100)}%` }}
          title={
            shownLabels?.[index] !== undefined
              ? `${shownLabels[index]}: ${value}`
              : String(value)
          }
        />
      ))}
    </div>
  );
}
