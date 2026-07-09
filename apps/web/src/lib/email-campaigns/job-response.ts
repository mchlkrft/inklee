// The exact aggregate shape both the dispatch endpoint (/api/internal/email-jobs) and the
// status endpoint (/api/internal/email-jobs/status) return to Control Tower. It carries ONLY
// aggregates + masked handle samples — never recipient emails or raw handles. Shared so the
// two endpoints can never drift. `job` is a loosely-typed row from serviceClient (the campaign
// tables are not in a generated Database type), so it is read defensively.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JobRow = any;

export type JobAggregate = {
  jobId: string;
  status: string;
  audienceSize: number;
  wouldSend: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  skipped: {
    opted_out: number;
    suppressed: number;
    tester: number;
    dedup: number;
    no_email: number;
  };
  sample: string[];
  error: string | null;
};

export function aggregateJobResponse(job: JobRow): JobAggregate {
  const skipped = (job?.skipped_detail ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);
  return {
    jobId: job?.id ?? "",
    status: job?.status ?? "unknown",
    audienceSize: num(job?.audience_size),
    wouldSend: num(job?.would_send),
    sentCount: num(job?.sent_count),
    failedCount: num(job?.failed_count),
    skippedCount: num(job?.skipped_count),
    skipped: {
      opted_out: num(skipped.opted_out),
      suppressed: num(skipped.suppressed),
      tester: num(skipped.tester),
      dedup: num(skipped.dedup),
      no_email: num(skipped.no_email),
    },
    sample: Array.isArray(job?.sample) ? (job.sample as string[]) : [],
    error: job?.error ?? null,
  };
}
