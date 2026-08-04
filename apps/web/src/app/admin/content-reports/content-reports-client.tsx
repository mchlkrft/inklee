"use client";

import { useActionState } from "react";
import {
  takedownGalleryImageAction,
  type ContentReportActionState,
} from "./actions";

export type ContentReportRow = {
  id: string;
  category: string;
  url: string;
  description: string;
  reporter_name: string;
  reporter_email: string;
  reference: string;
  status: string;
  target_artist_id: string | null;
  statement_of_reasons_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};

// The takedown is only offered for the gallery route; every other category is a
// manual operator step handled outside this action (per the DSA procedure).
function TakedownForm({ report }: { report: ContentReportRow }) {
  const [state, action, pending] = useActionState<
    ContentReportActionState,
    FormData
  >(takedownGalleryImageAction, null);

  return (
    <form
      action={action}
      className="mt-3 space-y-2 border-t border-border pt-3"
    >
      <input type="hidden" name="report_id" value={report.id} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">
            Hosting artist id
          </span>
          <input
            name="artist_id"
            required
            defaultValue={report.target_artist_id ?? ""}
            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">
            Hosted image URL
          </span>
          <input
            name="image_url"
            required
            defaultValue={report.url}
            className="w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">
          Grounds (optional operator note for the artist&apos;s statement)
        </span>
        <textarea
          name="grounds"
          rows={2}
          className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "Removing…" : "Remove image and issue statement"}
      </button>
      {state && "error" in state && (
        <p className="text-sm text-red-500">{state.error}</p>
      )}
      {state && "ok" in state && (
        <p className="text-sm text-green-600">
          Removed from{" "}
          {state.result.removedFromBuckets.join(", ") || "no bucket"}. Statement{" "}
          {state.result.statementId
            ? `recorded (${state.result.statementId})`
            : "not recorded (logged)"}
          . Block reference{" "}
          {state.result.strippedFromBlocks ? "stripped" : "unchanged"}.
        </p>
      )}
    </form>
  );
}

export default function ContentReportsClient({
  rows,
}: {
  rows: ContentReportRow[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-foreground">Content reports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        DSA notice-and-action queue (`content_reports`). The gallery takedown is
        offered on unresolved image-of-me-without-consent reports; other
        categories are handled per the DSA procedure.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No reports yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border p-4 text-sm"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono">{r.reference}</span>
                <span>·</span>
                <span>{r.category}</span>
                <span>·</span>
                <span className="font-medium">{r.status}</span>
                <span>·</span>
                <span>{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 break-all font-mono text-xs text-foreground">
                {r.url}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-foreground">
                {r.description}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {r.reporter_name} &lt;{r.reporter_email}&gt;
              </p>

              {r.category === "image_without_consent" &&
                r.status !== "actioned" && <TakedownForm report={r} />}

              {r.status === "actioned" && (
                <p className="mt-3 border-t border-border pt-3 text-xs text-green-600">
                  Actioned
                  {r.reviewed_at
                    ? ` ${new Date(r.reviewed_at).toLocaleString()}`
                    : ""}
                  . Statement {r.statement_of_reasons_id ?? "not recorded"}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
