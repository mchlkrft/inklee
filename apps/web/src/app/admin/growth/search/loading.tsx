import {
  MetricGridSkeleton,
  PillRowSkeleton,
  TableSkeleton,
} from "@/components/admin/growth/table-skeleton";

/** Skeleton shaped like the Search pages: sub-nav, range picker,
 *  summary cards, then query and page tables. */
export default function Loading() {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <PillRowSkeleton count={4} />
        <PillRowSkeleton count={7} />
      </div>
      <MetricGridSkeleton count={4} />
      <TableSkeleton rows={8} columns={5} />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
