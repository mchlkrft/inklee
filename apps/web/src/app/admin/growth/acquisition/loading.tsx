import {
  MetricGridSkeleton,
  PillRowSkeleton,
  TableSkeleton,
} from "@/components/admin/growth/table-skeleton";

/** Skeleton shaped like the Acquisition pages: sub-nav, range picker,
 *  KPI cards, then breakdown tables. */
export default function Loading() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <PillRowSkeleton count={5} />
        <PillRowSkeleton count={7} />
      </div>
      <MetricGridSkeleton count={8} />
      <TableSkeleton rows={6} columns={5} />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
